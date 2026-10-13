"""The Clients list can be filtered and sorted by animals and by town: GET /clients/headcounts gives every client's
animal total (the same number the client page shows), and the town is a normal client field, also importable."""
import asyncio
import io
import unittest
from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app import main  # noqa: F401 - registers every table
from app.api import clients
from app.models.client import Client
from app.models.program import AnimalGroup, HerdingProgram


class HeadcountTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.jan = Client(name="Jan", town="Prieska")
        self.piet = Client(name="Piet", town="Carnarvon")
        self.sue = Client(name="Sue")
        self.s.add_all([self.jan, self.piet, self.sue])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def program(self, client, when, **groups):
        p = HerdingProgram(client_id=client.id, name="Program", created_at=when)
        self.s.add(p)
        self.s.commit()
        for kind, size in groups.items():
            self.s.add(AnimalGroup(program_id=p.id, animal_type=kind, group_size=size))
        self.s.commit()
        return p

    def test_the_total_is_all_the_groups_of_the_newest_program_that_has_any(self):
        self.program(self.jan, datetime(2026, 1, 1), Ewes=100, Rams=5)
        self.program(self.jan, datetime(2026, 6, 1), Ewes=300, Lambs=120)
        self.program(self.jan, datetime(2026, 9, 1))  # newest, but nothing counted in it
        self.assertEqual(clients.headcounts(session=self.s)[self.jan.id], 420)

    def test_it_agrees_with_the_number_on_the_client_page(self):
        self.program(self.piet, datetime(2026, 5, 1), Ewes=250, Rams=10)
        summary = clients.read_client_summary(self.piet.id, session=self.s)
        self.assertEqual(clients.headcounts(session=self.s)[self.piet.id], summary["farm_animal_total"])

    def test_a_client_with_no_headcount_is_left_out_not_shown_as_zero(self):
        self.program(self.jan, datetime(2026, 1, 1), Ewes=10)
        out = clients.headcounts(session=self.s)
        self.assertIn(self.jan.id, out)
        self.assertNotIn(self.sue.id, out)

    def test_it_is_a_whole_list_in_one_call_for_many_clients(self):
        self.program(self.jan, datetime(2026, 1, 1), Ewes=10)
        self.program(self.piet, datetime(2026, 1, 1), Ewes=20)
        self.assertEqual(clients.headcounts(session=self.s), {self.jan.id: 10, self.piet.id: 20})


class TownTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def run_import(self, csv_text):
        upload = UploadFile(file=io.BytesIO(csv_text.encode()), filename="clients.csv")
        return asyncio.run(clients.import_clients(file=upload, session=self.s))

    def test_a_town_column_is_imported_under_any_common_heading(self):
        for heading in ("Town", "Area", "City", "Dorp", "District"):
            self.s.exec(select(Client)).all()
            out = self.run_import(f"Name,{heading}\nClient {heading},Prieska\n")
            self.assertEqual(out["columns_matched"].get("town"), heading, heading)
        self.assertTrue(all(c.town == "Prieska" for c in self.s.exec(select(Client)).all()))

    def test_an_existing_clients_town_is_updated_by_a_later_import(self):
        self.run_import("Name,Town\nJan,Prieska\n")
        self.run_import("Name,Town\nJan,Carnarvon\n")
        [jan] = self.s.exec(select(Client)).all()
        self.assertEqual(jan.town, "Carnarvon")

    def test_editing_a_client_keeps_the_town_unless_it_is_sent(self):
        jan = Client(name="Jan", town="Prieska")
        self.s.add(jan)
        self.s.commit()
        clients.update_client(jan.id, Client(name="Jan Smit"), session=self.s)
        self.s.refresh(jan)
        self.assertEqual((jan.name, jan.town), ("Jan Smit", "Prieska"))


if __name__ == "__main__":
    unittest.main()
