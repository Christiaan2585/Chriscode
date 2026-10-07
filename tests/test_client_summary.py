import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from app.api.clients import read_client_summary
from app.models.animal import Animal
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401 - table Animal references
from app.models.invoice import Invoice
from app.models.program import AnimalGroup, HerdingProgram
from app.models.quote import Quote
from app.models.user import User  # noqa: F401 - table Invoice references


class ClientSummaryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Jan Smit")
        other = Client(name="Piet Botha")
        self.s.add(self.client)
        self.s.add(other)
        self.s.commit()
        self.other_id = other.id

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def add(self, *rows):
        self.s.add_all(rows)
        self.s.commit()

    def test_counts_only_this_clients_records(self):
        cid = self.client.id
        self.add(
            Animal(client_id=cid, name="Bessie", species="Cows"),
            Animal(client_id=cid, name="Dolly", species="Sheep"),
            Animal(client_id=self.other_id, name="Other", species="Goats"),
            Invoice(client_id=cid, date=datetime(2026, 8, 1), total_amount=100.0, status="unpaid"),
            Invoice(client_id=cid, date=datetime(2026, 9, 1), total_amount=250.0, status="unpaid"),
            Invoice(client_id=cid, date=datetime(2026, 9, 20), total_amount=80.0, status="paid"),
            Invoice(client_id=cid, date=datetime(2026, 9, 25), total_amount=999.0, status="cancelled"),
            Invoice(client_id=self.other_id, total_amount=5000.0, status="unpaid"),
            Quote(client_id=cid, status="Draft"),
            Quote(client_id=cid, status="Sent"),
            Quote(client_id=cid, status="Accepted"),
        )

        summary = read_client_summary(cid, session=self.s)

        self.assertEqual(summary["animal_count"], 2)
        self.assertEqual(summary["unpaid_invoice_count"], 2)
        self.assertEqual(summary["outstanding"], 350.0)
        # The newest invoice that isn't cancelled.
        self.assertEqual(summary["last_invoice_date"], datetime(2026, 9, 20))
        self.assertEqual(summary["open_quote_count"], 2)

    def test_client_with_no_records(self):
        summary = read_client_summary(self.client.id, session=self.s)

        self.assertEqual(
            summary,
            {"animal_count": 0, "unpaid_invoice_count": 0, "outstanding": 0,
             "last_invoice_date": None, "open_quote_count": 0,
             "farm_animals": [], "farm_animal_total": 0, "has_tax_certificate": False},
        )

    def test_farm_animals_come_from_the_newest_program_with_headcounts(self):
        cid = self.client.id
        old = HerdingProgram(name="Last year", client_id=cid, created_at=datetime(2025, 1, 1))
        new = HerdingProgram(name="This year", client_id=cid, created_at=datetime(2026, 1, 1))
        empty = HerdingProgram(name="Just made", client_id=cid, created_at=datetime(2026, 6, 1))
        theirs = HerdingProgram(name="Other farm", client_id=self.other_id, created_at=datetime(2026, 9, 1))
        self.add(old, new, empty, theirs)
        self.add(
            AnimalGroup(program_id=old.id, animal_type="Ooie", group_size=50),
            AnimalGroup(program_id=new.id, animal_type="Ooie", group_size=80),
            AnimalGroup(program_id=new.id, animal_type="Ramme", group_size=4),
            AnimalGroup(program_id=theirs.id, animal_type="Ooie", group_size=999),
        )

        summary = read_client_summary(cid, session=self.s)

        self.assertEqual(summary["farm_animals"], [
            {"animal_type": "Ooie", "group_size": 80}, {"animal_type": "Ramme", "group_size": 4}])
        self.assertEqual(summary["farm_animal_total"], 84)

    def test_unknown_client_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            read_client_summary(9999, session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
