"""Photos on a client's page (a sick animal, a gate, a delivery): taken or chosen on the phone or PC, shrunk to a modest
JPEG plus a thumbnail (which also drops camera/GPS data), listed newest first, deletable by whoever added one or an
admin, and removed with the client."""
import asyncio
import io
import unittest

from fastapi import HTTPException
from PIL import Image
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app.api import photos
from app.core import cascade, export
from app.models.client import Client
from app.models.client_photo import ClientPhoto
from app.models.user import User
from app.models import animal, herd, invoice, quote, order, purchase_order, program, appointment, schedule, weight, note  # noqa: F401


def picture(width=2400, height=1800, fmt="JPEG", color=(200, 120, 60)):
    out = io.BytesIO()
    Image.new("RGB", (width, height), color).save(out, format=fmt)
    return out.getvalue()


def upload(data, name="photo.jpg"):
    return UploadFile(file=io.BytesIO(data), filename=name)


class PhotoTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Piet")
        self.sarah = User(name="Sarah", email="s@x.co", password_hash="x")
        self.jan = User(name="Jan", email="j@x.co", password_hash="x")
        self.boss = User(name="Boss", email="b@x.co", password_hash="x", is_admin=True)
        self.s.add_all([self.client, self.sarah, self.jan, self.boss])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def add(self, data=None, caption="", user=None, client=None):
        return asyncio.run(photos.add_photo(client_id=(client or self.client).id, file=upload(data or picture()), caption=caption,
                                            session=self.s, user=user or self.sarah))

    def test_a_big_photo_is_shrunk_and_gets_a_thumbnail(self):
        row = self.add(caption="  Sick ewe at the dam  ")
        stored = self.s.get(ClientPhoto, row["id"])
        self.assertEqual(Image.open(io.BytesIO(stored.image)).size, (1280, 960))
        self.assertLessEqual(max(Image.open(io.BytesIO(stored.thumb)).size), 240)
        self.assertEqual(row["caption"], "Sick ewe at the dam")
        self.assertEqual(stored.by_user_id, self.sarah.id)

    def test_a_small_photo_is_not_blown_up(self):
        self.assertEqual(Image.open(io.BytesIO(self.s.get(ClientPhoto, self.add(picture(300, 200))["id"]).image)).size, (300, 200))

    def test_a_png_is_accepted_and_stored_as_jpeg(self):
        stored = self.s.get(ClientPhoto, self.add(picture(400, 300, "PNG"))["id"])
        self.assertEqual(Image.open(io.BytesIO(stored.image)).format, "JPEG")

    def test_something_that_is_not_a_picture_is_refused(self):
        with self.assertRaises(HTTPException) as caught:
            self.add(b"%PDF-1.4 not a picture")
        self.assertEqual(caught.exception.status_code, 422)

    def test_a_huge_upload_or_a_missing_client_is_refused(self):
        with self.assertRaises(HTTPException) as caught:
            self.add(b"x" * (photos.MAX_UPLOAD_BYTES + 1))
        self.assertEqual(caught.exception.status_code, 413)
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(photos.add_photo(client_id=999, file=upload(picture()), caption="", session=self.s, user=self.sarah))
        self.assertEqual(caught.exception.status_code, 404)

    def test_the_list_is_newest_first_with_thumbnails_as_data_urls(self):
        first, second = self.add(caption="first"), self.add(caption="second")
        listed = photos.list_photos(self.client.id, session=self.s)
        self.assertEqual([p["caption"] for p in listed], ["second", "first"])
        self.assertTrue(listed[0]["thumb"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(listed[0]["by"], "Sarah")
        self.assertNotIn("image", listed[0])  # the full picture is fetched on its own

    def test_the_full_picture_comes_back_as_a_jpeg(self):
        row = self.add()
        response = photos.photo_image(row["id"], session=self.s)
        self.assertEqual(response.media_type, "image/jpeg")
        self.assertTrue(response.body.startswith(b"\xff\xd8"))
        with self.assertRaises(HTTPException):
            photos.photo_image(9999, session=self.s)

    def test_only_who_added_it_or_an_admin_can_delete(self):
        row = self.add(user=self.sarah)
        with self.assertRaises(HTTPException) as caught:
            photos.delete_photo(row["id"], session=self.s, user=self.jan)
        self.assertEqual(caught.exception.status_code, 403)
        photos.delete_photo(row["id"], session=self.s, user=self.sarah)
        self.assertEqual(self.s.exec(select(ClientPhoto)).all(), [])
        again = self.add(user=self.sarah)
        photos.delete_photo(again["id"], session=self.s, user=self.boss)
        self.assertEqual(self.s.exec(select(ClientPhoto)).all(), [])

    def test_a_client_can_only_have_so_many(self):
        for _ in range(photos.MAX_PER_CLIENT):
            self.s.add(ClientPhoto(client_id=self.client.id, image=b"i", thumb=b"t"))
        self.s.commit()
        with self.assertRaises(HTTPException) as caught:
            self.add()
        self.assertEqual(caught.exception.status_code, 409)

    def test_deleting_a_client_removes_their_photos_and_the_excel_export_skips_the_table(self):
        self.add()
        cascade.delete_client(self.s, self.client)
        self.s.commit()
        self.assertEqual(self.s.exec(select(ClientPhoto)).all(), [])
        self.assertIn("clientphoto", export.EXCLUDED_TABLES)


if __name__ == "__main__":
    unittest.main()
