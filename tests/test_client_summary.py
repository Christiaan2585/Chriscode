import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from app.api.clients import read_client_summary
from app.models.animal import Animal
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401 - table Animal references
from app.models.invoice import Invoice
from app.models.quote import Quote


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
            {"animal_count": 0, "unpaid_invoice_count": 0, "outstanding": 0.0,
             "last_invoice_date": None, "open_quote_count": 0},
        )

    def test_unknown_client_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            read_client_summary(9999, session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
