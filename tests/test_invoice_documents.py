import unittest
from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine

from app.api import invoices, quotes
from app.api.business import BusinessSettingsUpdate, read_business, update_business
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder  # noqa: F401
from app.models.quote import Quote
from app.models.quote_item import QuoteItem


class InvoiceDocumentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Garstland Farms CC")
        self.tag = Product(name="Z-Tag M4/F4 Green (10)", code="83096", price=230.65, price_excl_vat=200.57)
        self.s.add_all([self.client, self.tag])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def settings(self, **changes):
        data = {**BusinessSettings().model_dump(exclude={"id"}), **changes}
        update_business(BusinessSettingsUpdate(**data), session=self.s)

    def new_invoice(self, **fields):
        return invoices.create_invoice(
            Invoice.model_validate({"client_id": self.client.id, "date": "2026-09-24T00:00:00", **fields}),
            session=self.s, user=None,
        )

    def add_line(self, invoice, **fields):
        return invoices.add_invoice_item(
            InvoiceItem.model_validate({"invoice_id": invoice.id, "product_id": self.tag.id,
                                        "quantity": 7, "unit_price": 0, "subtotal": 0, **fields}),
            session=self.s,
        )

    def test_numbers_continue_from_the_sage_sequence(self):
        self.settings(invoice_start_number=181)
        first, second = self.new_invoice(), self.new_invoice()
        self.assertEqual((first.number, second.number), ("INV0000181", "INV0000182"))

    def test_due_date_uses_payment_terms(self):
        self.settings(payment_terms_days=6)
        self.assertEqual(self.new_invoice().due_date, datetime(2026, 9, 30))

    def test_explicit_due_date_is_kept(self):
        self.assertEqual(self.new_invoice(due_date="2026-10-15T00:00:00").due_date, datetime(2026, 10, 15))

    def test_editing_keeps_number_and_fields_not_sent(self):
        inv = self.new_invoice(reference="PO 55")
        self.add_line(inv)
        # The same partial payload the invoice form sends.
        invoices.update_invoice(inv.id, Invoice.model_validate(
            {"client_id": self.client.id, "status": "paid", "notes": "x", "date": "2026-09-24T00:00:00",
             "total_amount": 0}), session=self.s)
        self.s.refresh(inv)
        self.assertEqual((inv.number, inv.reference, inv.status), ("INV0000001", "PO 55", "paid"))
        self.assertEqual(inv.total_amount, 1614.55)  # server-side total, not the 0 sent

    def test_line_uses_product_price_and_discount(self):
        inv = self.new_invoice()
        line = self.add_line(inv, discount_percent=10)
        self.s.refresh(inv)
        self.assertEqual((line.unit_price, line.vat_percent, line.subtotal), (230.65, 0.0, 1453.1))
        self.assertEqual(inv.total_amount, 1453.1)

    def test_typed_price_wins(self):
        line = self.add_line(self.new_invoice(), unit_price=199.99, quantity=1)
        self.assertEqual(line.subtotal, 199.99)

    def test_vat_registered_charges_vat_on_excl_price(self):
        self.settings(vat_registered=True, vat_number="4123456789")
        line = self.add_line(self.new_invoice(), quantity=1)
        self.assertEqual((line.unit_price, line.vat_percent, line.subtotal), (200.57, 15.0, 230.66))

    def test_removing_a_line_recomputes_the_total(self):
        inv = self.new_invoice()
        keep = self.add_line(inv, quantity=1)
        drop = self.add_line(inv, quantity=2)
        invoices.delete_invoice_item(drop.id, session=self.s)
        self.s.refresh(inv)
        self.assertEqual(inv.total_amount, keep.subtotal)

    def test_quotes_number_separately_and_get_expiry(self):
        self.settings(quote_valid_days=30)
        self.new_invoice()
        # Not model_validate(dict): Quote's "items" relationship would pick up dict.items.
        q = quotes.create_quote(Quote(client_id=self.client.id, date="2026-09-01T00:00:00"), session=self.s, user=None)
        line = quotes.add_quote_item(q.id, QuoteItem.model_validate(
            {"product_id": self.tag.id, "quantity": 2, "unit_price": 0, "discount_percent": 50}), session=self.s)
        self.s.refresh(q)
        self.assertEqual((q.number, q.expiry_date), ("QUO0000001", datetime(2026, 10, 1)))
        self.assertEqual((line.subtotal, q.total_amount), (230.65, 230.65))

    def test_business_settings_report_next_numbers(self):
        self.settings(invoice_start_number=181)
        self.new_invoice()
        self.assertEqual(read_business(session=self.s)["next_invoice_number"], "INV0000182")


if __name__ == "__main__":
    unittest.main()
