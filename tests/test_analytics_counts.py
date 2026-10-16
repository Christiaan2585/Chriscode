"""GET /analytics/counts: how many clients, quotes and invoices there are - without loading them (the Getting started
checklist only needs to know whether there is a first one)."""
import unittest

from sqlmodel import Session, SQLModel, create_engine

from app.api import analytics
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401
from app.models.invoice import Invoice
from app.models.purchase_order import PurchaseOrder  # noqa: F401
from app.models.quote import Quote
from app.models import user, program, appointment, schedule, weight, note, order  # noqa: F401


class CountsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def test_an_empty_business_has_nothing(self):
        self.assertEqual(analytics.get_counts(session=self.s), {"clients": 0, "quotes": 0, "invoices": 0})

    def test_it_counts_each_kind(self):
        client = Client(name="Piet")
        self.s.add(client)
        self.s.commit()
        self.s.add_all([Quote(client_id=client.id), Quote(client_id=client.id), Invoice(client_id=client.id)])
        self.s.add(Client(name="Sarie"))
        self.s.commit()
        self.assertEqual(analytics.get_counts(session=self.s), {"clients": 2, "quotes": 2, "invoices": 1})


if __name__ == "__main__":
    unittest.main()
