import base64
import io
import re
import unittest
import zlib

from fastapi import HTTPException
from PIL import Image
from sqlmodel import Session, SQLModel, create_engine

from app.api import products
from app.api.business import BusinessSettingsUpdate, update_business
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.business import BusinessSettings
from app.models.herd import Herd  # noqa: F401
from app.models.product import Product, ProductImage
from app.models.user import User  # noqa: F401


def pdf_text(data):
    out = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        chunk = m.group(1).strip()
        try:
            if chunk.endswith(b"~>"):
                chunk = base64.a85decode(chunk[:-2])
            out.append(zlib.decompress(chunk).decode("latin-1"))
        except Exception:
            pass
    return "".join(re.findall(r"\((.*?)\)\s*Tj", "".join(out)))


class ProductPatchTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.p = Product(name="Cattle dip 1L", price=287.5, cost=200.0, category="Dips")
        self.s.add(self.p)
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def patch(self, **fields):
        return products.patch_product(self.p.id, products.ProductPatch(**fields), session=self.s)

    def test_one_field_at_a_time(self):
        out = self.patch(description="Pour-on dip for ticks")
        self.assertEqual((out.description, out.name, out.price), ("Pour-on dip for ticks", "Cattle dip 1L", 287.5))

    def test_stock_and_active_switches(self):
        self.patch(in_stock=False)
        out = self.patch(is_active=False)
        self.assertEqual((out.in_stock, out.is_active), (False, False))

    def test_blank_name_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.patch(name="   ")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_negative_price_rejected(self):
        with self.assertRaises(ValueError):
            products.ProductPatch(price=-1)

    def test_blank_optional_text_becomes_empty(self):
        self.assertIsNone(self.patch(category="  ").category)

    def test_unknown_product_404(self):
        with self.assertRaises(HTTPException) as ctx:
            products.patch_product(9999, products.ProductPatch(name="x"), session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)


class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        data = {**BusinessSettings().model_dump(exclude={"id"}), "trading_name": "Sandveld Veedienste",
                "phone": "000 000 0000"}
        update_business(BusinessSettingsUpdate(**data), session=self.s)
        dip = Product(name="Cattle dip 1L", code="10001", price=287.5, cost=123.45, category="Dips",
                      description="Pour-on dip for ticks", packaging="6 x 1 L")
        vac = Product(name="Pulpy kidney vaccine", price=145.0, category="Vaccines", in_stock=False)
        old = Product(name="Discontinued drench", price=99.0, category="Dips", is_active=False)
        self.s.add_all([dip, vac, old])
        self.s.commit()
        buf = io.BytesIO()
        Image.new("RGB", (400, 300), (40, 120, 40)).save(buf, format="JPEG")
        self.s.add(ProductImage(product_id=dip.id, image=buf.getvalue(), thumbnail=buf.getvalue()))
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def pdf(self, category=None):
        response = products.product_catalogue_pdf(category=category, session=self.s)
        body = b"".join(response.body_iterator) if hasattr(response, "body_iterator") else response.body
        return body

    def test_catalogue_contents(self):
        data = self.pdf()
        text = pdf_text(data)
        self.assertTrue(data.startswith(b"%PDF"))
        for needle in ["PRODUCT CATALOGUE", "Sandveld Veedienste", "Dips", "Vaccines", "Cattle dip 1L", "10001",
                       "Pour-on dip for ticks", "6 x 1 L", "R287.50", "Pulpy kidney vaccine", "Out of stock"]:
            self.assertIn(needle, text, needle)
        self.assertIn(b"/Subtype /Image", data)

    def test_hidden_products_and_cost_prices_left_out(self):
        text = pdf_text(self.pdf())
        self.assertNotIn("Discontinued drench", text)
        self.assertNotIn("123.45", text)

    def test_one_category(self):
        text = pdf_text(self.pdf(category="Vaccines"))
        self.assertIn("Pulpy kidney vaccine", text)
        self.assertNotIn("Cattle dip 1L", text)


if __name__ == "__main__":
    unittest.main()
