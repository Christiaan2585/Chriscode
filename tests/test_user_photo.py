import asyncio
import base64
import io
import unittest

from fastapi import HTTPException
from PIL import Image
from sqlmodel import Session, SQLModel, create_engine
from starlette.datastructures import UploadFile

from app.api import auth
from app.core.export import EXCLUDED_TABLES
from app.models.user import User, UserPhoto


def picture(size=(600, 300), fmt="PNG", color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


def decode(data_url):
    header, b64 = data_url.split(",", 1)
    return header, Image.open(io.BytesIO(base64.b64decode(b64)))


class UserPhotoTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.user = User(name="Nico", email="nico@example.com", is_admin=True)
        self.s.add(self.user)
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def upload(self, data, filename="me.png"):
        f = UploadFile(file=io.BytesIO(data), filename=filename)
        return asyncio.run(auth.upload_my_photo(file=f, user=self.user, session=self.s))

    def test_photo_is_a_square_jpeg_on_the_profile(self):
        out = self.upload(picture())
        header, img = decode(out.avatar_url)
        self.assertEqual(header, "data:image/jpeg;base64")
        self.assertEqual(img.size, (256, 256))
        self.assertEqual(img.format, "JPEG")

    def test_photo_is_on_me_and_the_staff_list(self):
        self.upload(picture())
        self.assertTrue(auth.me(user=self.user, session=self.s).avatar_url.startswith("data:image/jpeg"))
        listed = auth.list_users(_=self.user, session=self.s)
        self.assertTrue(listed[0].avatar_url.startswith("data:image/jpeg"))

    def test_small_photo_is_not_blown_up_past_its_size(self):
        _, img = decode(self.upload(picture(size=(90, 120))).avatar_url)
        self.assertEqual(img.size, (90, 90))

    def test_replacing_keeps_one_photo(self):
        self.upload(picture())
        self.upload(picture(color=(0, 0, 255)))
        self.assertEqual(len(self.s.exec(UserPhoto.__table__.select()).all()), 1)

    def test_not_a_picture(self):
        with self.assertRaises(HTTPException) as ctx:
            self.upload(b"%PDF-1.4 not a picture", filename="cv.pdf")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_too_big(self):
        with self.assertRaises(HTTPException) as ctx:
            self.upload(b"x" * (auth.MAX_PHOTO_UPLOAD_BYTES + 1))
        self.assertEqual(ctx.exception.status_code, 413)

    def test_removing_falls_back_to_the_google_picture(self):
        self.user.avatar_url = "https://lh3.googleusercontent.com/a/example"
        self.s.add(self.user)
        self.s.commit()
        self.upload(picture())
        out = auth.delete_my_photo(user=self.user, session=self.s)
        self.assertEqual(out.avatar_url, "https://lh3.googleusercontent.com/a/example")

    def test_removing_when_there_is_none_is_fine(self):
        self.assertIsNone(auth.delete_my_photo(user=self.user, session=self.s).avatar_url)

    def test_photos_stay_out_of_the_excel_export(self):
        self.assertIn("userphoto", EXCLUDED_TABLES)


if __name__ == "__main__":
    unittest.main()
