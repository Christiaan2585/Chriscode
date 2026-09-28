import asyncio
import io
import os
import tempfile
import unittest

from fastapi import HTTPException
from PIL import Image
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app.api import products
from app.core import cascade
from app.core.export import build_workbook
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.herd import Herd  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.product import Product, ProductImage


def image_bytes(size=(2000, 1500), fmt="PNG", mode="RGB", color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, format=fmt)
    return buf.getvalue()


class ProductImageTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.product = Product(name="Cattle dip 1L", price=287.5)
        self.s.add(self.product)
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def upload(self, data, filename="photo.png", product_id=None):
        f = UploadFile(file=io.BytesIO(data), filename=filename)
        return asyncio.run(products.upload_product_image(product_id or self.product.id, file=f, session=self.s))

    def stored(self):
        return self.s.exec(select(ProductImage).where(ProductImage.product_id == self.product.id)).all()

    def test_upload_is_shrunk_to_jpeg_with_thumbnail(self):
        self.upload(image_bytes())
        [row] = self.stored()
        big = Image.open(io.BytesIO(row.image))
        thumb = Image.open(io.BytesIO(row.thumbnail))
        self.assertEqual((big.format, thumb.format), ("JPEG", "JPEG"))
        self.assertEqual(big.size, (800, 600))
        self.assertLessEqual(max(thumb.size), 160)

    def test_small_images_are_not_enlarged(self):
        self.upload(image_bytes(size=(300, 200)))
        self.assertEqual(Image.open(io.BytesIO(self.stored()[0].image)).size, (300, 200))

    def test_transparent_png_gets_a_white_background(self):
        self.upload(image_bytes(size=(50, 50), mode="RGBA", color=(0, 0, 0, 0)))
        pixel = Image.open(io.BytesIO(self.stored()[0].image)).convert("RGB").getpixel((25, 25))
        self.assertTrue(all(c > 240 for c in pixel), pixel)

    def test_replacing_keeps_one_picture(self):
        self.upload(image_bytes(color=(255, 0, 0)))
        self.upload(image_bytes(color=(0, 0, 255)))
        self.assertEqual(len(self.stored()), 1)

    def test_not_an_image_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.upload(b"this is not a picture", filename="evil.png")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(self.stored(), [])

    def test_too_big_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.upload(b"\x89PNG" + b"0" * (products.MAX_IMAGE_UPLOAD_BYTES + 1))
        self.assertEqual(ctx.exception.status_code, 413)

    def test_unknown_product_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            self.upload(image_bytes(), product_id=9999)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_serving_and_thumbnails(self):
        self.upload(image_bytes())
        response = products.read_product_image(self.product.id, session=self.s)
        self.assertEqual(response.media_type, "image/jpeg")
        self.assertEqual(response.body[:2], b"\xff\xd8")
        thumbs = products.read_product_thumbnails(session=self.s)
        self.assertTrue(thumbs[self.product.id].startswith("data:image/jpeg;base64,"))

    def test_removing_the_picture(self):
        self.upload(image_bytes())
        products.delete_product_image(self.product.id, session=self.s)
        with self.assertRaises(HTTPException) as ctx:
            products.read_product_image(self.product.id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(products.read_product_thumbnails(session=self.s), {})

    def test_deleting_the_product_deletes_its_picture(self):
        self.upload(image_bytes())
        cascade.delete_product(self.s, self.product)
        self.s.commit()
        self.assertEqual(self.s.exec(select(ProductImage)).all(), [])

    def test_excel_export_leaves_pictures_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = os.path.join(tmp, "t.db")
            engine = create_engine(f"sqlite:///{db}")
            SQLModel.metadata.create_all(engine)
            engine.dispose()
            self.assertNotIn("productimage", build_workbook(db).sheetnames)


if __name__ == "__main__":
    unittest.main()
