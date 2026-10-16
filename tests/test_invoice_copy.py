"""One-click invoices: make an invoice from a quote (the lines carry over, the invoice gets its own number and due
date), and repeat an invoice (same client and lines, none of the payments). A herding program's own quote is
invoiced per date from the program, never from here."""
import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import invoices, payments, quotes
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import Payment
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder  # noqa: F401
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from app.models import user, program, appointment, schedule, weight, note, order  # noqa: F401


class InvoiceCopyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Piet")
        self.dose = Product(name="Dose", price=115.0, price_excl_vat=100.0)
        self.tag = Product(name="Tag", price=23.0, price_excl_vat=20.0)
        self.s.add_all([self.client, self.dose, self.tag])
        self.s.commit()
        self.quote = quotes.create_quote(Quote(client_id=self.client.id, notes="For the dosing round", reference="Round 2"), session=self.s, user=None)
        quotes.add_quote_item(self.quote.id, QuoteItem(product_id=self.dose.id, quantity=3, unit_price=100.0, discount_percent=10.0), session=self.s)
        quotes.add_quote_item(self.quote.id, QuoteItem(product_id=self.tag.id, quantity=5, unit_price=20.0), session=self.s)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def lines(self, invoice):
        return sorted((i.product_id, i.quantity, i.unit_price, i.discount_percent or 0) for i in
                      self.s.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all())

    def test_an_invoice_from_a_quote_carries_the_lines_over(self):
        invoice = invoices.invoice_from_quote(self.quote.id, session=self.s, user=None)
        self.assertEqual(invoice.client_id, self.client.id)
        self.assertEqual(self.lines(invoice), [(self.dose.id, 3.0, 100.0, 10.0), (self.tag.id, 5.0, 20.0, 0)])
        self.assertTrue(invoice.number.startswith("INV"))
        self.assertEqual(invoice.status, "unpaid")
        self.assertIsNotNone(invoice.due_date)
        self.assertGreater(invoice.total_amount, 0)
        self.assertIn(self.quote.number, invoice.reference)  # says where it came from
        self.assertEqual(invoice.notes, "For the dosing round")

    def test_the_quote_itself_is_left_alone(self):
        before = self.s.get(Quote, self.quote.id).status
        invoices.invoice_from_quote(self.quote.id, session=self.s, user=None)
        self.assertEqual(self.s.get(Quote, self.quote.id).status, before)

    def test_a_quote_with_no_lines_or_a_program_quote_or_a_missing_one_is_refused(self):
        empty = quotes.create_quote(Quote(client_id=self.client.id), session=self.s, user=None)
        with self.assertRaises(HTTPException) as e:
            invoices.invoice_from_quote(empty.id, session=self.s, user=None)
        self.assertEqual(e.exception.status_code, 422)
        owned = self.s.get(Quote, self.quote.id)
        owned.program_id = 99
        self.s.add(owned)
        self.s.commit()
        with self.assertRaises(HTTPException) as e:
            invoices.invoice_from_quote(self.quote.id, session=self.s, user=None)
        self.assertEqual(e.exception.status_code, 409)
        with self.assertRaises(HTTPException) as e:
            invoices.invoice_from_quote(12345, session=self.s, user=None)
        self.assertEqual(e.exception.status_code, 404)

    def test_each_invoice_gets_its_own_number(self):
        a = invoices.invoice_from_quote(self.quote.id, session=self.s, user=None)
        b = invoices.invoice_from_quote(self.quote.id, session=self.s, user=None)
        self.assertNotEqual(a.number, b.number)

    def test_repeating_an_invoice_copies_the_lines_but_not_the_payments(self):
        original = invoices.invoice_from_quote(self.quote.id, session=self.s, user=None)
        payments.record_payment(original.id, payments.PaymentIn(amount=50), session=self.s, user=None)
        copy = invoices.duplicate_invoice(original.id, session=self.s, user=None)
        self.assertNotEqual(copy.id, original.id)
        self.assertNotEqual(copy.number, original.number)
        self.assertEqual(self.lines(copy), self.lines(original))
        self.assertEqual(copy.total_amount, original.total_amount)
        self.assertEqual(copy.status, "unpaid")
        self.assertEqual(self.s.exec(select(Payment).where(Payment.invoice_id == copy.id)).all(), [])
        self.assertIn(original.number, copy.reference)

    def test_repeating_a_cancelled_invoice_gives_a_live_one(self):
        original = invoices.invoice_from_quote(self.quote.id, session=self.s, user=None)
        original.status = "cancelled"
        self.s.add(original)
        self.s.commit()
        self.assertEqual(invoices.duplicate_invoice(original.id, session=self.s, user=None).status, "unpaid")
        with self.assertRaises(HTTPException) as e:
            invoices.duplicate_invoice(999, session=self.s, user=None)
        self.assertEqual(e.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
