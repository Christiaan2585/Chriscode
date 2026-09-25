import unittest
from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine

from app.api.analytics import get_revenue_by_month, get_revenue_stats
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.product import Product  # noqa: F401 - invoice items reference it


class RevenueTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        client = Client(name="Jan")
        self.s.add(client)
        self.s.commit()
        now = datetime.utcnow()
        for amount, status in ((100.0, "paid"), (40.0, "unpaid"), (999.0, "cancelled")):
            self.s.add(Invoice(client_id=client.id, total_amount=amount, status=status, date=now))
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def test_cancelled_invoices_are_not_revenue(self):
        stats = get_revenue_stats(session=self.s)
        self.assertEqual(stats, {"total_revenue": 140.0, "outstanding_balance": 40.0, "collected": 100.0})

    def test_monthly_chart_counts_paid_invoices_only(self):
        months = get_revenue_by_month(months=1, session=self.s)
        self.assertEqual(months[-1]["revenue"], 100.0)


if __name__ == "__main__":
    unittest.main()
