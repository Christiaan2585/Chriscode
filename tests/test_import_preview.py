"""Import preview: the same import, run as a "check" (dry_run=True), tells you what WOULD happen - created, updated,
columns matched, row problems - and changes nothing. Then the real import gives the same answer."""
import asyncio
import io
import unittest

from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app.api import clients, products
from app.api.programs import import_programs
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401
from app.models.product import Product
from app.models.program import AnimalGroup, HerdingProgram


def upload(text, name="file.csv"):
    return UploadFile(file=io.BytesIO(text.encode()), filename=name)


class ImportPreviewTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def count(self, model):
        return len(self.s.exec(select(model)).all())

    # --- clients
    def test_a_client_check_reports_but_saves_nothing(self):
        self.s.add(Client(name="Jan", email="jan@example.com"))
        self.s.commit()
        csv = "Name,Email,Town\nJan,jan@example.com,Prieska\nPiet,piet@example.com,Douglas\n"
        checked = asyncio.run(clients.import_clients(file=upload(csv), dry_run=True, session=self.s))
        self.assertEqual((checked["created"], checked["updated"], checked["dry_run"]), (1, 1, True))
        self.assertEqual(checked["columns_matched"].get("town"), "Town")
        self.assertEqual(self.count(Client), 1)  # Piet was not added
        self.assertIsNone(self.s.exec(select(Client).where(Client.name == "Jan")).one().town)  # Jan was not changed

    def test_the_real_import_gives_the_same_answer_and_saves(self):
        csv = "Name,Email\nPiet,piet@example.com\nSarie,sarie@example.com\n"
        checked = asyncio.run(clients.import_clients(file=upload(csv), dry_run=True, session=self.s))
        real = asyncio.run(clients.import_clients(file=upload(csv), session=self.s))
        self.assertEqual((checked["created"], checked["updated"]), (real["created"], real["updated"]))
        self.assertFalse(real["dry_run"])
        self.assertEqual(self.count(Client), 2)

    def test_a_check_does_not_start_standard_programs_for_clients_it_did_not_add(self):
        asyncio.run(clients.import_clients(file=upload("Name\nPiet\n"), dry_run=True, session=self.s))
        self.assertEqual(self.count(HerdingProgram), 0)

    # --- herding programs
    def test_a_program_check_changes_nothing(self):
        self.s.add(Client(name="Jan Smit", email="jan@example.com"))
        self.s.commit()
        csv = "Client,Program Name,Animal Type,Count,Goal\nJan Smit,Spring,Sheep,40,Lambing\n"
        checked = asyncio.run(import_programs(file=upload(csv), dry_run=True, session=self.s))
        self.assertEqual((checked["created"], checked["dry_run"]), (1, True))
        self.assertEqual(self.count(HerdingProgram), 0)
        self.assertEqual(self.count(AnimalGroup), 0)
        real = asyncio.run(import_programs(file=upload(csv), session=self.s))
        self.assertEqual(real["created"], 1)
        self.assertEqual(self.count(HerdingProgram), 1)

    # --- products
    def test_a_product_check_changes_nothing(self):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Product", "Code", "Pack", "Per carton", "Unit Price", "Excl VAT", "Incl VAT"])
        ws.append(["Dose A", "D1", 100, 10, 50, 62.5, 71.88])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        checked = asyncio.run(products.import_products(file=UploadFile(file=buf, filename="p.xlsx"), dry_run=True, session=self.s))
        self.assertTrue(checked["dry_run"])
        self.assertEqual(checked["created"] + checked["updated"] + len(checked["errors"]) > 0, True)
        self.assertEqual(self.count(Product), 0)


if __name__ == "__main__":
    unittest.main()
