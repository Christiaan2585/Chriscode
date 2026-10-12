"""Payments and credit notes against invoices: the balance, the paid/unpaid status that follows from it, numbering,
refusals, and what deleting an invoice does to them."""
import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table the schema refers to
from app.api import invoices, payments
from app.core import settlement
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import CreditNote, Payment
from app.models.product import Product
from app.models.user import User


class PaymentCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.s.add(BusinessSettings(id=1, trading_name="Test", vat_registered=True, vat_rate=15.0))
        self.client = Client(name="Jan Smit", farm_name="Rietvlei")
        self.product = Product(name="Dip", price=115.0, price_excl_vat=100.0)
        self.user = User(name="Nico", email="nico@example.com", is_admin=True)
        self.s.add_all([self.client, self.product, self.user])
        self.s.commit()
        # One line: 10 x R100 excl + 15% VAT = R1150.00 incl (R150.00 VAT).
        self.invoice = Invoice(client_id=self.client.id, number="INV0000001", total_amount=1150.0, status="unpaid",
                               date=datetime(2026, 9, 1), due_date=datetime(2026, 10, 1))
        self.s.add(self.invoice)
        self.s.commit()
        self.s.add(InvoiceItem(invoice_id=self.invoice.id, product_id=self.product.id, quantity=10, unit_price=100.0,
                               subtotal=1150.0, vat_percent=15.0))
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def pay(self, amount, **extra):
        return payments.record_payment(self.invoice.id, payments.PaymentIn(amount=amount, **extra), session=self.s, user=self.user)

    def credit(self, amount, reason="Damaged stock returned"):
        return payments.issue_credit_note(self.invoice.id, payments.CreditNoteIn(amount=amount, reason=reason), session=self.s, user=self.user)

    def balance(self):
        self.s.refresh(self.invoice)
        return settlement.invoice_balance(self.s, self.invoice)


class PaymentTests(PaymentCase):
    def test_a_part_payment_lowers_the_balance_and_leaves_it_unpaid(self):
        self.pay(500)
        b = self.balance()
        self.assertEqual((b["paid"], b["balance"]), (500.0, 650.0))
        self.assertEqual(self.invoice.status, "unpaid")

    def test_paying_the_rest_marks_it_paid(self):
        self.pay(500)
        self.pay(650)
        self.assertEqual(self.balance()["balance"], 0.0)
        self.assertEqual(self.invoice.status, "paid")

    def test_more_than_is_owed_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            self.pay(1150.01)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_nothing_or_a_negative_amount_is_refused(self):
        for bad in (0, -5):
            with self.assertRaises(Exception):
                self.pay(bad)

    def test_a_cancelled_invoice_takes_no_payments(self):
        self.invoice.status = "cancelled"
        self.s.add(self.invoice)
        self.s.commit()
        with self.assertRaises(HTTPException) as ctx:
            self.pay(100)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_removing_a_payment_reopens_the_invoice(self):
        self.pay(1150)
        payment = self.s.exec(select(Payment)).one()
        payments.delete_payment(payment.id, session=self.s)
        self.assertEqual(self.balance()["balance"], 1150.0)
        self.assertEqual(self.invoice.status, "unpaid")

    def test_the_list_shows_payments_credits_and_the_balance(self):
        self.pay(200, method="Cash", reference="Till slip 4")
        self.credit(115)
        out = payments.invoice_settlement(self.invoice.id, session=self.s)
        self.assertEqual(out["balance"], 835.0)
        self.assertEqual([p["method"] for p in out["payments"]], ["Cash"])
        self.assertEqual(out["credit_notes"][0]["number"], "CRN0000001")


class CreditNoteTests(PaymentCase):
    def test_numbered_in_order_and_lowering_the_balance(self):
        first = self.credit(115)
        second = self.credit(230)
        self.assertEqual((first.number, second.number), ("CRN0000001", "CRN0000002"))
        self.assertEqual(self.balance()["credited"], 345.0)
        self.assertEqual(self.balance()["balance"], 805.0)

    def test_the_vat_part_follows_the_invoice(self):
        note = self.credit(115)
        self.assertEqual(note.vat_amount, 15.0)  # 115 incl at the invoice's 15% -> R15 VAT

    def test_a_paid_invoice_can_still_be_credited_and_then_the_client_is_owed(self):
        self.pay(1150)
        self.credit(115)
        b = self.balance()
        self.assertEqual(b["balance"], -115.0)
        self.assertEqual(self.invoice.status, "paid")

    def test_never_more_credit_than_the_invoice_total(self):
        self.credit(1000)
        with self.assertRaises(HTTPException) as ctx:
            self.credit(150.01)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_a_reason_is_needed(self):
        with self.assertRaises(Exception):
            self.credit(10, reason="  ")

    def test_crediting_everything_unpaid_settles_the_invoice(self):
        self.credit(1150)
        self.assertEqual(self.invoice.status, "paid")


class PdfTests(PaymentCase):
    def test_the_credit_note_prints(self):
        note = self.credit(115)
        response = payments.credit_note_pdf(note.id, session=self.s)
        self.assertEqual(response.media_type, "application/pdf")  # the bytes themselves are checked in the next test

    def test_pdfs_are_real_pdfs_and_the_invoice_shows_what_is_left_to_pay(self):
        from pypdf import PdfReader
        from app.api.business import document_lines, get_business
        from app.core.pdf import generate_credit_note_pdf, generate_invoice_pdf
        self.pay(500)
        note = self.credit(115)
        credit = generate_credit_note_pdf(get_business(self.s), note, self.invoice, self.client).getvalue()
        self.assertTrue(credit.startswith(b"%PDF"))
        text = PdfReader(__import__("io").BytesIO(credit)).pages[0].extract_text()
        self.assertIn("CRN0000001", text)
        self.assertIn("115.00", text)
        items = self.s.exec(select(InvoiceItem)).all()
        invoice_pdf = generate_invoice_pdf(get_business(self.s), self.invoice, self.client, document_lines(self.s, items),
                                           balance=self.balance()["balance"]).getvalue()
        self.assertIn("535.00", PdfReader(__import__("io").BytesIO(invoice_pdf)).pages[0].extract_text())

class BalancesAndDeleteTests(PaymentCase):
    def test_balances_for_every_invoice_in_one_call(self):
        self.pay(150)
        out = payments.all_balances(session=self.s)
        self.assertEqual(out[str(self.invoice.id)]["balance"], 1000.0)

    def test_deleting_the_invoice_removes_its_payments_and_credit_notes(self):
        self.pay(100)
        self.credit(115)
        invoices.delete_invoice(self.invoice.id, session=self.s)
        self.assertEqual(self.s.exec(select(Payment)).all(), [])
        self.assertEqual(self.s.exec(select(CreditNote)).all(), [])


class DashboardMoneyTests(PaymentCase):
    def test_money_owed_counts_what_is_still_outstanding_not_the_invoice_total(self):
        from datetime import date
        from app.core.dashboard import build_dashboard
        self.pay(400)
        money = build_dashboard(self.s, date(2026, 10, 12))["money"]
        self.assertEqual(money["unpaid_total"], 750.0)
        self.assertEqual(money["past_due_total"], 750.0)


if __name__ == "__main__":
    unittest.main()
