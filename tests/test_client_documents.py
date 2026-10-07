"""A client's tax certificate: a PDF or picture kept on their page."""
import asyncio
import io
import unittest

from fastapi import HTTPException, UploadFile
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import clients
from app.core import cascade
from app.core.export import EXCLUDED_TABLES
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.client import Client
from app.models.client_document import ClientDocument
from app.models.herd import Herd  # noqa: F401
from app.models.invoice import Invoice  # noqa: F401
from app.models.user import User  # noqa: F401

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 40


def upload(data: bytes, name: str = "certificate.pdf") -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=name)


class TaxCertificateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Oom Piet")
        self.other = Client(name="Oom Koos")
        self.s.add_all([self.client, self.other])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def put(self, data, name="certificate.pdf", client=None):
        return asyncio.run(clients.upload_tax_certificate((client or self.client).id, upload(data, name), session=self.s))

    def test_nothing_loaded_yet(self):
        self.assertEqual(clients.tax_certificate_info(self.client.id, session=self.s), {"exists": False})
        with self.assertRaises(HTTPException) as ctx:
            clients.download_tax_certificate(self.client.id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_a_pdf_is_kept_and_comes_back_unchanged(self):
        info = self.put(PDF, "Tax clearance 2026.pdf")
        self.assertEqual((info["exists"], info["filename"], info["content_type"], info["size"]),
                         (True, "Tax clearance 2026.pdf", "application/pdf", len(PDF)))
        response = clients.download_tax_certificate(self.client.id, session=self.s)
        self.assertEqual((response.body, response.media_type), (PDF, "application/pdf"))
        self.assertEqual(clients.tax_certificate_info(self.client.id, session=self.s)["filename"], "Tax clearance 2026.pdf")

    def test_pictures_are_accepted_too(self):
        self.assertEqual(self.put(PNG, "scan.png")["content_type"], "image/png")
        self.assertEqual(self.put(JPEG, "scan.jpg")["content_type"], "image/jpeg")

    def test_loading_another_replaces_it(self):
        self.put(PDF, "old.pdf")
        self.put(PNG, "new.png")
        rows = self.s.exec(select(ClientDocument).where(ClientDocument.client_id == self.client.id)).all()
        self.assertEqual([(r.filename, r.content_type) for r in rows], [("new.png", "image/png")])

    def test_it_belongs_to_that_client_only(self):
        self.put(PDF)
        self.assertEqual(clients.tax_certificate_info(self.other.id, session=self.s), {"exists": False})

    def test_what_is_not_a_pdf_or_picture_is_refused_whatever_it_is_called(self):
        for data, name in ((b"MZ\x90\x00" + b"\x00" * 40, "certificate.pdf"), (b"hello", "notes.pdf"),
                           (b"<html><script>alert(1)</script>", "page.png"), (b"", "empty.pdf")):
            with self.assertRaises(HTTPException) as ctx:
                self.put(data, name)
            self.assertEqual(ctx.exception.status_code, 422, name)
        self.assertEqual(self.s.exec(select(ClientDocument)).all(), [])

    def test_too_big_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            self.put(PDF + b"0" * clients.MAX_DOCUMENT_BYTES)
        self.assertEqual(ctx.exception.status_code, 413)

    def test_the_file_name_is_made_safe(self):
        info = self.put(PDF, "..\\..\\Windows\\System32\\evil<>:name.pdf")
        self.assertNotIn("\\", info["filename"])
        self.assertNotIn("..", info["filename"])
        self.assertNotIn("<", info["filename"])
        self.assertTrue(info["filename"].endswith(".pdf"))

    def test_unknown_client(self):
        with self.assertRaises(HTTPException) as ctx:
            self.put(PDF, client=Client(id=999, name="x"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_it_can_be_removed(self):
        self.put(PDF)
        clients.delete_tax_certificate(self.client.id, session=self.s)
        self.assertEqual(clients.tax_certificate_info(self.client.id, session=self.s), {"exists": False})

    def test_deleting_the_client_deletes_it(self):
        self.put(PDF)
        cascade.delete_client(self.s, self.client)
        self.s.commit()
        self.assertEqual(self.s.exec(select(ClientDocument)).all(), [])

    def test_the_summary_says_whether_there_is_one(self):
        self.assertFalse(clients.read_client_summary(self.client.id, session=self.s)["has_tax_certificate"])
        self.put(PDF)
        self.assertTrue(clients.read_client_summary(self.client.id, session=self.s)["has_tax_certificate"])

    def test_the_files_are_not_dumped_into_the_excel_export(self):
        self.assertIn("clientdocument", EXCLUDED_TABLES)


if __name__ == "__main__":
    unittest.main()
