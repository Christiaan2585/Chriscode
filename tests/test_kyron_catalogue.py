"""The supplier's own catalogue PDF (English + Afrikaans) used as the app's
catalogue: its pages stay exactly as they are, and a price column (with
quantity boxes on order forms) is added down the right of every page.
The test book is made up - the real one is the supplier's and never goes
into this public repo."""
import io
import os
import tempfile
import unittest
from unittest import mock

from fastapi import HTTPException
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import business, catalogue, quotes
from app.core import cascade, kyron_catalogue as kc
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.business import BusinessSettings
from app.models.catalogue import CatalogueLink
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401
from app.models.product import Product
from app.models.quote_item import QuoteItem
from app.models.user import User

INDEX = {"en": ["Bantik 1", "MaxiCyp 20% 1", "Supatraz 25% 2", "Deltadip Pour-On 2"],
         "af": ["Bantik 1", "MaxiCyp 20% 1", "Supatraz 25% 2", "Deltadip Opgietmiddel 2"]}


def made_up_book(lang="en", index_heading="INDEX", pages_after=1):
    """cover, 2 rep pages, index, 2 product pages, then other pages."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    for text in ("PRODUCT CATALOGUE", "Regional Representatives", "Head Office"):
        c.drawString(40, 500, text); c.showPage()
    c.drawString(40, 560, index_heading)
    for i, line in enumerate(INDEX[lang]):
        c.drawString(40, 530 - i * 16, "• " + line)
    c.showPage()
    for n in (1, 2):
        c.drawString(40, 560, f"Product page {n} text"); c.drawString(200, 20, str(n)); c.showPage()
    for n in range(pages_after):
        c.drawString(40, 560, "HEALTH PROGRAM"); c.showPage()
    c.save()
    return buf.getvalue()


class ParseTests(unittest.TestCase):
    def test_index_is_read_with_pages_and_order(self):
        meta = kc.parse_catalogue(made_up_book())
        self.assertEqual(meta["offset"], 4)
        self.assertEqual(meta["pages"], 7)
        self.assertEqual([(e["name"], e["page"], e["order"]) for e in meta["entries"]],
                         [("Bantik", 1, 0), ("MaxiCyp 20%", 1, 1), ("Supatraz 25%", 2, 0), ("Deltadip Pour-On", 2, 1)])

    def test_afrikaans_index_heading(self):
        meta = kc.parse_catalogue(made_up_book("af", "INHOUD"))
        self.assertEqual(meta["entries"][3]["name"], "Deltadip Opgietmiddel")

    def test_not_a_pdf(self):
        with self.assertRaises(kc.CatalogueError):
            kc.parse_catalogue(b"not a pdf")

    def test_pdf_without_an_index(self):
        buf = io.BytesIO(); c = canvas.Canvas(buf); c.drawString(40, 500, "hello"); c.showPage(); c.save()
        with self.assertRaises(kc.CatalogueError):
            kc.parse_catalogue(buf.getvalue())

    def test_index_pointing_past_the_end(self):
        with self.assertRaises(kc.CatalogueError):
            kc.parse_catalogue(made_up_book_missing_pages())

    def test_keys_match_across_languages_by_position(self):
        en, af = kc.parse_catalogue(made_up_book("en")), kc.parse_catalogue(made_up_book("af", "INHOUD"))
        self.assertEqual(kc.keys_for(af, en), [e["key"] for e in en["entries"]])


def made_up_book_missing_pages():
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A5)
    c.drawString(40, 560, "INDEX"); c.drawString(40, 530, "• Bantik 9"); c.drawString(40, 514, "• Maxicyp 9")
    c.showPage(); c.save()
    return buf.getvalue()


class SuggestTests(unittest.TestCase):
    def test_all_words_of_the_catalogue_name_must_be_in_the_product_name(self):
        products = [Product(id=1, name="Bantik 1L", price=1), Product(id=2, name="BANTIK 5 L", price=1),
                    Product(id=3, name="Maxicyp 20% 1L", price=1), Product(id=4, name="Supatraz 125 1L", price=1),
                    Product(id=5, name="Endo+Lint 5L", price=1)]
        self.assertEqual(kc.suggest("Bantik", products), [1, 2])
        self.assertEqual(kc.suggest("MaxiCyp 20%", products), [3])
        self.assertEqual(kc.suggest("Supatraz 25%", products), [])
        self.assertEqual(kc.suggest("Endo + Lint", products), [5])


class CatalogueTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        patcher = mock.patch.object(kc, "catalogue_dir", return_value=self.dir)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        settings = {**BusinessSettings().model_dump(exclude={"id"}), "trading_name": "Sandveld Vee Dienste",
                    "phone": "082 000 0000", "vat_registered": False}
        business.update_business(business.BusinessSettingsUpdate(**settings), session=self.s)
        self.client = Client(name="Oom Piet")
        self.user = User(name="Rep", email="rep@example.com", password_hash="x", is_admin=True)
        self.bantik1 = Product(name="Bantik 1L", price=450.0, packaging="1 L")
        self.bantik5 = Product(name="Bantik 5L", price=1900.0, packaging="5 L", in_stock=False)
        self.hidden = Product(name="Bantik 20L", price=7000.0, is_active=False)
        self.other = Product(name="Ear tag applicator", price=320.0, category="Equipment")
        self.s.add_all([self.client, self.user, self.bantik1, self.bantik5, self.hidden, self.other])
        self.s.commit()
        kc.save_catalogue("en", made_up_book("en"))
        kc.save_catalogue("af", made_up_book("af", "INHOUD"))
        key = kc.load_meta("en")["entries"][0]["key"]
        catalogue.set_links(key, catalogue.LinkRequest(product_ids=[self.bantik1.id, self.bantik5.id, self.hidden.id]),
                            session=self.s)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def pdf(self, lang="en", client_id=None):
        return catalogue.kyron_pdf(lang, client_id=client_id, session=self.s).body


class BuildTests(CatalogueTestCase):
    def test_every_supplier_page_is_kept_and_widened(self):
        reader = PdfReader(io.BytesIO(self.pdf()))
        self.assertGreaterEqual(len(reader.pages), 7)
        original = PdfReader(io.BytesIO(made_up_book()))
        for i in range(7):
            self.assertAlmostEqual(float(reader.pages[i].mediabox.width),
                                   float(original.pages[i].mediabox.width) + kc.COLUMN_WIDTH)
        self.assertIn("Product page 1 text", reader.pages[4].extract_text())

    def test_prices_beside_the_products(self):
        text = PdfReader(io.BytesIO(self.pdf())).pages[4].extract_text()
        self.assertIn("Prices", text)
        self.assertIn("R450.00", text)
        self.assertIn("R1,900.00", text)
        self.assertIn("Out of stock", text)
        self.assertNotIn("R7,000.00", text)  # hidden product
        self.assertIn("Price on request", text)  # MaxiCyp isn't linked

    def test_afrikaans(self):
        text = PdfReader(io.BytesIO(self.pdf("af"))).pages[4].extract_text()
        self.assertIn("Pryse", text)
        self.assertIn("R450.00", text)
        self.assertIn("Prys op aanvraag", text)

    def test_your_details_on_the_cover(self):
        text = PdfReader(io.BytesIO(self.pdf())).pages[0].extract_text()
        self.assertIn("Sandveld Vee Dienste", text)
        self.assertIn("082 000 0000", text)

    def test_products_not_in_the_book_are_added_at_the_back(self):
        reader = PdfReader(io.BytesIO(self.pdf()))
        self.assertIn("Ear tag applicator", reader.pages[-1].extract_text())

    def test_book_not_loaded_yet(self):
        os.remove(kc.pdf_path("af"))
        with self.assertRaises(HTTPException) as ctx:
            self.pdf("af")
        self.assertEqual(ctx.exception.status_code, 404)


class OrderFormTests(CatalogueTestCase):
    def test_order_form_fields(self):
        fields = PdfReader(io.BytesIO(self.pdf(client_id=self.client.id))).get_fields()
        self.assertIn(f"qty_{self.bantik1.id}", fields)
        self.assertIn(f"qty_{self.other.id}", fields)
        self.assertNotIn(f"qty_{self.hidden.id}", fields)
        self.assertEqual(fields["order_client"].value, str(self.client.id))
        self.assertIn("order_notes", fields)

    def test_tick_boxes_beside_every_pack_size(self):
        fields = PdfReader(io.BytesIO(self.pdf(client_id=self.client.id))).get_fields()
        self.assertIn(f"pick_{self.bantik1.id}", fields)
        self.assertIn(f"pick_{self.other.id}", fields)
        self.assertEqual(fields[f"pick_{self.bantik1.id}"].get("/FT"), "/Btn")

    def test_ticked_only_orders_one(self):
        writer = PdfWriter(clone_from=PdfReader(io.BytesIO(self.pdf(client_id=self.client.id))))
        for page in writer.pages:
            writer.update_page_form_field_values(page, {f"pick_{self.bantik5.id}": "/Yes"}, auto_regenerate=False)
        out = io.BytesIO(); writer.write(out)
        result = quotes.quote_from_order_form(self.s, out.getvalue(), None, self.user)
        items = self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == result["quote"].id)).all()
        self.assertEqual([(i.product_id, i.quantity) for i in items], [(self.bantik5.id, 1.0)])

    def test_filled_form_becomes_a_quote(self):
        writer = PdfWriter(clone_from=PdfReader(io.BytesIO(self.pdf("af", client_id=self.client.id))))
        for page in writer.pages:
            writer.update_page_form_field_values(
                page, {f"qty_{self.bantik1.id}": "3", f"qty_{self.other.id}": "1", "order_notes": "Vrydag"},
                auto_regenerate=False)
        out = io.BytesIO(); writer.write(out)
        result = quotes.quote_from_order_form(self.s, out.getvalue(), None, self.user)
        items = self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == result["quote"].id)).all()
        self.assertEqual(sorted((i.product_id, i.quantity) for i in items),
                         sorted([(self.bantik1.id, 3.0), (self.other.id, 1.0)]))
        self.assertEqual(result["quote"].client_id, self.client.id)


class LinkTests(CatalogueTestCase):
    def test_summary_lists_entries_links_and_suggestions(self):
        out = catalogue.read_kyron(session=self.s)
        self.assertTrue(out["languages"]["en"] and out["languages"]["af"])
        first = out["entries"][0]
        self.assertEqual((first["name"], first["name_af"]), ("Bantik", "Bantik"))
        self.assertEqual(first["product_ids"], [self.bantik1.id, self.bantik5.id, self.hidden.id])
        self.assertEqual(out["entries"][3]["name_af"], "Deltadip Opgietmiddel")

    def test_link_suggested_fills_only_unlinked_entries(self):
        self.s.add(Product(name="Maxicyp 20% 1L", price=300.0))
        self.s.commit()
        result = catalogue.link_suggested(session=self.s)
        self.assertEqual(result["linked"], 1)
        out = catalogue.read_kyron(session=self.s)
        self.assertEqual(len(out["entries"][1]["product_ids"]), 1)
        self.assertEqual(len(out["entries"][0]["product_ids"]), 3)  # untouched

    def test_unknown_product_refused(self):
        key = kc.load_meta("en")["entries"][1]["key"]
        with self.assertRaises(HTTPException) as ctx:
            catalogue.set_links(key, catalogue.LinkRequest(product_ids=[9999]), session=self.s)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_deleting_a_product_removes_its_links(self):
        cascade.delete_product(self.s, self.bantik5)
        self.s.commit()
        ids = [l.product_id for l in self.s.exec(select(CatalogueLink)).all()]
        self.assertNotIn(self.bantik5.id, ids)


if __name__ == "__main__":
    unittest.main()
