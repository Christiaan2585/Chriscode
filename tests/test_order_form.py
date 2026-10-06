import io
import unittest

from fastapi import HTTPException
from pypdf import PdfReader, PdfWriter
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import products, quotes
from app.api.business import BusinessSettingsUpdate, update_business
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401
from app.models.product import Product
from app.models.quote_item import QuoteItem
from app.models.user import User


def catalogue_bytes(session, client_id=None):
    return products.product_catalogue_pdf(category=None, client_id=client_id, session=session).body


def fill(pdf_bytes, values):
    """Fill the form the way a phone PDF viewer would: set field values and save."""
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(pdf_bytes)))
    for page in writer.pages:
        writer.update_page_form_field_values(page, values, auto_regenerate=False)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


class OrderFormTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        settings = {**BusinessSettings().model_dump(exclude={"id"}), "trading_name": "Sandveld", "phone": "082 000 0000"}
        update_business(BusinessSettingsUpdate(**settings), session=self.s)
        self.client = Client(name="Oom Piet")
        self.other = Client(name="Tannie Sarie")
        self.dip = Product(name="Cattle dip 1L", price=115.0, category="Dips")
        self.tag = Product(name="Ear tag", price=10.0, category="Tags")
        self.hidden = Product(name="Old stock", price=5.0, is_active=False)
        self.user = User(name="Rep", email="rep@example.com", password_hash="x")
        self.s.add_all([self.client, self.other, self.dip, self.tag, self.hidden, self.user])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def form_fields(self, data):
        return PdfReader(io.BytesIO(data)).get_fields() or {}

    def order(self, data, client_id=None):
        return quotes.quote_from_order_form(self.s, data, client_id, self.user)

    def test_plain_catalogue_has_no_form_fields(self):
        self.assertEqual(self.form_fields(catalogue_bytes(self.s)), {})

    def test_order_form_has_a_tick_box_per_product(self):
        fields = self.form_fields(catalogue_bytes(self.s, self.client.id))
        self.assertIn(f"pick_{self.dip.id}", fields)
        self.assertIn(f"pick_{self.tag.id}", fields)

    def test_ticked_without_a_quantity_means_one(self):
        data = fill(catalogue_bytes(self.s, self.client.id), {f"pick_{self.dip.id}": "/Yes"})
        quote = self.order(data)["quote"]
        items = self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id)).all()
        self.assertEqual([(i.product_id, i.quantity) for i in items], [(self.dip.id, 1.0)])

    def test_typed_quantity_wins_over_the_tick(self):
        data = fill(catalogue_bytes(self.s, self.client.id), {f"pick_{self.dip.id}": "/Yes", f"qty_{self.dip.id}": "4"})
        quote = self.order(data)["quote"]
        items = self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id)).all()
        self.assertEqual([(i.product_id, i.quantity) for i in items], [(self.dip.id, 4.0)])

    def test_order_form_has_a_quantity_box_per_active_product(self):
        fields = self.form_fields(catalogue_bytes(self.s, self.client.id))
        self.assertIn(f"qty_{self.dip.id}", fields)
        self.assertIn(f"qty_{self.tag.id}", fields)
        self.assertNotIn(f"qty_{self.hidden.id}", fields)
        self.assertIn("order_notes", fields)
        self.assertEqual(fields["order_client"].value, str(self.client.id))

    def test_unknown_client_404(self):
        with self.assertRaises(HTTPException) as ctx:
            catalogue_bytes(self.s, 9999)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_filled_form_becomes_a_draft_quote(self):
        data = fill(catalogue_bytes(self.s, self.client.id),
                    {f"qty_{self.dip.id}": "2", f"qty_{self.tag.id}": "1,5", "order_notes": "Deliver Friday"})
        result = self.order(data)
        quote = result["quote"]
        self.assertEqual(quote.client_id, self.client.id)
        self.assertEqual(quote.status, "Draft")
        self.assertTrue(quote.number.startswith("QUO"))
        self.assertEqual(quote.created_by, self.user.id)
        self.assertIn("Deliver Friday", quote.notes)
        items = self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id)).all()
        self.assertEqual(sorted((i.product_id, i.quantity) for i in items),
                         sorted([(self.dip.id, 2.0), (self.tag.id, 1.5)]))
        self.assertAlmostEqual(quote.total_amount, 2 * 115.0 + 1.5 * 10.0)
        self.assertEqual(result["skipped"], [])

    def test_blank_and_zero_are_ignored_and_bad_values_reported(self):
        data = fill(catalogue_bytes(self.s, self.client.id),
                    {f"qty_{self.dip.id}": "3", f"qty_{self.tag.id}": "lots"})
        result = self.order(data)
        items = self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == result["quote"].id)).all()
        self.assertEqual([(i.product_id, i.quantity) for i in items], [(self.dip.id, 3.0)])
        self.assertEqual(len(result["skipped"]), 1)
        self.assertIn("Ear tag", result["skipped"][0])

    def test_deleted_product_is_skipped_not_fatal(self):
        data = fill(catalogue_bytes(self.s, self.client.id),
                    {f"qty_{self.dip.id}": "1", f"qty_{self.tag.id}": "4"})
        self.s.delete(self.tag)
        self.s.commit()
        result = self.order(data)
        self.assertEqual(len(result["skipped"]), 1)
        items = self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == result["quote"].id)).all()
        self.assertEqual([i.product_id for i in items], [self.dip.id])

    def test_nothing_filled_in_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.order(catalogue_bytes(self.s, self.client.id))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_not_a_pdf_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.order(b"hello, not a pdf")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_plain_catalogue_is_not_an_order_form(self):
        with self.assertRaises(HTTPException) as ctx:
            self.order(catalogue_bytes(self.s))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_chosen_client_overrides_the_form(self):
        data = fill(catalogue_bytes(self.s, self.client.id), {f"qty_{self.dip.id}": "1"})
        self.assertEqual(self.order(data, client_id=self.other.id)["quote"].client_id, self.other.id)

    def test_form_for_a_deleted_client_needs_a_client_chosen(self):
        data = fill(catalogue_bytes(self.s, self.client.id), {f"qty_{self.dip.id}": "1"})
        self.s.delete(self.client)
        self.s.commit()
        with self.assertRaises(HTTPException) as ctx:
            self.order(data)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(self.order(data, client_id=self.other.id)["quote"].client_id, self.other.id)


if __name__ == "__main__":
    unittest.main()
