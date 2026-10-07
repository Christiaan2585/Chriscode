"""More than one catalogue: any number of extra catalogue PDFs, each added to
the end of a list. The PDFs here are made up."""
import asyncio
import io
import os
import tempfile
import unittest
from unittest import mock

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from app.api import catalogue
from app.core import catalogue_library as lib
from app.core import kyron_catalogue as kc
from tests.test_kyron_catalogue import made_up_book


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        patcher = mock.patch.object(kc, "catalogue_dir", return_value=self.dir)
        patcher.start()
        self.addCleanup(patcher.stop)

    def add(self, name="Dip supplier", filename="dips.pdf", data=None):
        return lib.add_catalogue(data or made_up_book(), filename, name)

    def test_nothing_loaded_yet(self):
        self.assertEqual(lib.list_catalogues(), [])

    def test_each_one_added_goes_below_the_others(self):
        first, second, third = self.add("A"), self.add("B"), self.add("C")
        self.assertEqual([c["name"] for c in lib.list_catalogues()], ["A", "B", "C"])
        self.assertEqual(len({first["id"], second["id"], third["id"]}), 3)

    def test_it_records_what_it_is(self):
        entry = self.add("Dips", "Dips 2026.pdf")
        self.assertEqual((entry["name"], entry["filename"], entry["pages"]), ("Dips", "Dips 2026.pdf", 7))
        self.assertGreater(entry["size"], 100)
        self.assertTrue(entry["uploaded_at"])

    def test_without_a_name_the_file_name_is_used(self):
        self.assertEqual(self.add(None, "Feed prices 2026.pdf")["name"], "Feed prices 2026")

    def test_the_pdf_comes_back_unchanged(self):
        book = made_up_book()
        entry = self.add(data=book)
        with open(lib.pdf_path(entry["id"]), "rb") as f:
            self.assertEqual(f.read(), book)

    def test_what_is_not_a_pdf_is_refused(self):
        for data in (b"hello", b"MZ\x90\x00" + b"\x00" * 50, b"%PDF-1.4 but not really"):
            with self.assertRaises(lib.LibraryError):
                self.add(data=data)
        self.assertEqual(lib.list_catalogues(), [])

    def test_rename_and_remove(self):
        entry = self.add("Old name")
        self.assertEqual(lib.rename_catalogue(entry["id"], "  New name  ")["name"], "New name")
        with self.assertRaises(lib.LibraryError):
            lib.rename_catalogue(entry["id"], "   ")
        lib.remove_catalogue(entry["id"])
        self.assertEqual(lib.list_catalogues(), [])
        self.assertFalse(os.path.exists(lib.pdf_path(entry["id"])))

    def test_an_id_can_only_be_one_the_library_made(self):
        for bad in ("../kyron", "..\\..\\x", "supplier-en", "", "a" * 33, "G" * 32):
            self.assertIsNone(lib.pdf_path(bad), bad)

    def test_the_kyron_books_are_untouched(self):
        kc.save_catalogue("en", made_up_book())
        self.add()
        self.assertIsNotNone(kc.load_meta("en"))
        self.assertEqual(len(lib.list_catalogues()), 1)


class LibraryEndpointTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        patcher = mock.patch.object(kc, "catalogue_dir", return_value=self.dir)
        patcher.start()
        self.addCleanup(patcher.stop)

    def upload(self, data=None, filename="book.pdf", name=None):
        return asyncio.run(catalogue.add_to_library(UploadFile(file=io.BytesIO(data or made_up_book()), filename=filename), name=name))

    def test_upload_list_download_rename_delete(self):
        a = self.upload(name="First")
        b = self.upload(filename="Second one.pdf")
        self.assertEqual([c["name"] for c in catalogue.read_library()], ["First", "Second one"])

        response = catalogue.library_pdf(a["id"])
        self.assertEqual(response.media_type, "application/pdf")
        self.assertEqual(len(PdfReader(io.BytesIO(open(response.path, "rb").read())).pages), 7)

        self.assertEqual(catalogue.rename_in_library(b["id"], catalogue.RenameRequest(name="Renamed"))["name"], "Renamed")
        catalogue.delete_from_library(a["id"])
        self.assertEqual([c["name"] for c in catalogue.read_library()], ["Renamed"])

    def test_not_a_pdf_is_a_422(self):
        with self.assertRaises(HTTPException) as ctx:
            self.upload(b"not a pdf at all")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_too_big_is_a_413(self):
        with mock.patch.object(catalogue, "MAX_BOOK_BYTES", 100):
            with self.assertRaises(HTTPException) as ctx:
                self.upload()
        self.assertEqual(ctx.exception.status_code, 413)

    def test_unknown_catalogue_is_a_404(self):
        for call in (lambda: catalogue.library_pdf("0" * 32), lambda: catalogue.delete_from_library("0" * 32),
                     lambda: catalogue.rename_in_library("0" * 32, catalogue.RenameRequest(name="x"))):
            with self.assertRaises(HTTPException) as ctx:
                call()
            self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
