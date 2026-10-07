"""The dashboard's numbers and its "needs attention" list. Made-up data."""
import unittest
from datetime import date, datetime, timedelta

from sqlmodel import select

from app.api import analytics
from app.core import dashboard, herding
from app.models.client import Client
from app.models.client_document import ClientDocument
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product
from app.models.program import HerdingProgram, ProgramStep
from app.models.quote import Quote
from tests.test_herding import HerdingTestCase, sheet_like_the_business_uses

TODAY = date(2026, 6, 15)


def at(days, today=TODAY):
    d = today + timedelta(days=days)
    return datetime(d.year, d.month, d.day)


class DashboardTestCase(HerdingTestCase):
    def build(self):
        return dashboard.build_dashboard(self.s, today=TODAY)

    def invoice(self, total, status="unpaid", date_offset=-10, due_offset=None, client=None, **fields):
        inv = Invoice(client_id=(client or self.client).id, total_amount=total, status=status, date=at(date_offset),
                      due_date=None if due_offset is None else at(due_offset), **fields)
        self.s.add(inv)
        self.s.commit()
        return inv

    def quote(self, total, status="Sent", date_offset=-10, **fields):
        q = Quote(client_id=self.client.id, total_amount=total, status=status, date=at(date_offset), **fields)
        self.s.add(q)
        self.s.commit()
        return q

    def items(self, kind):
        return [a for a in self.build()["attention"] if a["type"] == kind]


class MoneyTests(DashboardTestCase):
    def test_what_is_owed_and_what_is_past_due(self):
        self.invoice(100, due_offset=5)            # owed, not due yet
        self.invoice(250, due_offset=-3)           # 3 days past due
        self.invoice(400, due_offset=-20)          # 20 days past due
        self.invoice(999, status="paid", due_offset=-30)
        self.invoice(777, status="cancelled", due_offset=-30)
        money = self.build()["money"]
        self.assertEqual((money["unpaid_total"], money["unpaid_count"]), (750.0, 3))
        self.assertEqual((money["past_due_total"], money["past_due_count"], money["oldest_past_due_days"]), (650.0, 2, 20))

    def test_an_old_invoice_without_a_due_date_is_due_after_the_payment_terms(self):
        self.invoice(100, date_offset=-45, due_offset=None)  # terms are 30 days: due 15 days ago
        self.invoice(100, date_offset=-5, due_offset=None)
        money = self.build()["money"]
        self.assertEqual(money["past_due_count"], 1)
        self.assertEqual(money["oldest_past_due_days"], 15)

    def test_nothing_owed(self):
        self.assertEqual(self.build()["money"], {"unpaid_total": 0.0, "unpaid_count": 0, "past_due_total": 0.0,
                                                 "past_due_count": 0, "oldest_past_due_days": 0})


class QuotesWaitingTests(DashboardTestCase):
    def test_sent_quotes_are_the_ones_waiting(self):
        self.quote(500, "Sent", -2)
        self.quote(1500, "Sent", -12)
        self.quote(300, "Draft", -30)
        self.quote(900, "Accepted", -30)
        waiting = self.build()["quotes_waiting"]
        self.assertEqual((waiting["count"], waiting["total"], waiting["oldest_days"]), (2, 2000.0, 12))

    def test_only_quotes_sent_over_a_week_ago_are_on_the_attention_list(self):
        self.quote(500, "Sent", -2)
        old = self.quote(1500, "Sent", -12, number="QUO0000007")
        (item,) = self.items("quote_followup")
        self.assertIn("QUO0000007", item["title"])
        self.assertIn("12 days", item["detail"])
        self.assertEqual((item["client_id"], item["link"]), (self.client.id, f"/clients/{self.client.id}"))
        self.assertEqual(old.id, item["id"])


class AttentionInvoiceTests(DashboardTestCase):
    def test_a_past_due_invoice_is_listed_the_worst_first(self):
        self.invoice(250, due_offset=-3, number="INV0000001")
        self.invoice(400, due_offset=-20, number="INV0000002")
        self.invoice(100, due_offset=5)
        items = self.items("invoice_overdue")
        self.assertEqual([i["title"].split()[1] for i in items], ["INV0000002", "INV0000001"])
        self.assertIn("20 days overdue", items[0]["detail"])
        self.assertEqual(items[0]["severity"], "overdue")


class AttentionProgramTests(DashboardTestCase):
    def setUp(self):
        super().setUp()
        herding.import_template(self.s, sheet_like_the_business_uses())
        herding.ensure_scan_step(self.s)
        # First mating 40 days before "today": step dates fall on both sides of today.
        self.prog = HerdingProgram(name="Kudde", client_id=self.client.id, mating_date=at(-40))
        self.s.add(self.prog)
        self.s.commit()

    def steps(self):
        return [a for a in self.build()["attention"] if a["type"] in ("treatment", "scan")]

    def test_only_steps_within_two_weeks_either_side_are_listed(self):
        for item in self.steps():
            d = date.fromisoformat(item["date"])
            self.assertTrue(TODAY - timedelta(days=14) <= d <= TODAY + timedelta(days=14), item)

    def test_older_overdue_steps_are_counted_not_listed(self):
        out = self.build()
        self.assertGreater(out["older_overdue"]["steps"], 0)
        self.assertEqual(out["older_overdue"]["clients"], 1)
        listed = [date.fromisoformat(a["date"]) for a in self.steps()]
        self.assertTrue(all(d >= TODAY - timedelta(days=14) for d in listed))

    def test_a_done_step_is_not_listed(self):
        before = self.steps()
        self.assertTrue(before)
        out = herding.schedule(self.s, self.prog, TODAY)
        target = next(s for s in out["steps"] if s["id"] == before[0]["step_id"])
        step = self.s.get(ProgramStep, target["id"])
        step.done_at = datetime(2026, 6, 1)
        self.s.add(step)
        self.s.commit()
        self.assertNotIn(target["id"], [a["step_id"] for a in self.steps()])

    def test_the_scan_date_is_flagged_as_a_scan(self):
        self.prog.mating_date = at(-77 + 5)  # scan date is in 5 days
        self.s.add(self.prog)
        self.s.commit()
        scans = self.items("scan")
        self.assertEqual(len(scans), 1)
        self.assertEqual(scans[0]["date"], (TODAY + timedelta(days=5)).isoformat())
        self.assertEqual(scans[0]["severity"], "soon")

    def test_each_item_says_whose_farm_it_is(self):
        self.client.farm_name = "Rietvlei"
        self.s.add(self.client)
        self.s.commit()
        for item in self.steps():
            self.assertEqual((item["client_name"], item["link"]), ("Rietvlei", f"/programs/{self.prog.id}"))


class ReadyToInvoiceTests(DashboardTestCase):
    def test_an_accepted_program_with_a_date_not_yet_invoiced(self):
        from tests.test_herding_costs import cost_sheet  # the same made-up cost sheet
        from app.core import program_quote
        from app.models.program import AnimalGroup

        self.s.add(Product(name="Vaccine A - 250ml", price=455.69, price_excl_vat=396.25, unit="ml", pack_size=250))
        self.s.commit()
        herding.import_cost_sheet(self.s, cost_sheet())
        program = HerdingProgram(name="Kudde", client_id=self.client.id, mating_date=at(-3))
        self.s.add(program)
        self.s.commit()
        for label, n in (("Ooie", 100), ("Ramme", 4)):
            self.s.add(AnimalGroup(program_id=program.id, animal_type=label, group_size=n))
        self.s.commit()
        program_quote.sync(self.s, program)
        self.s.refresh(program)
        # Nothing is ready while the quote is only a draft.
        self.assertEqual(self.items("ready_to_invoice"), [])
        quote = self.s.get(Quote, program.quote_id)
        quote.status = "Accepted"
        self.s.add(quote)
        self.s.commit()
        ready = self.items("ready_to_invoice")
        self.assertTrue(ready)
        self.assertEqual(ready[0]["link"], f"/programs/{program.id}")
        self.assertTrue(ready[0]["title"].startswith("Invoice "))


class ClientInfoTests(DashboardTestCase):
    def test_clients_with_gaps_are_counted_once_each_kind(self):
        full = Client(name="Oom Koos", phone="082 000 0000", address="Plot 1")
        self.s.add(full)
        self.s.commit()
        self.s.add(ClientDocument(client_id=full.id, kind="tax_certificate", filename="x.pdf",
                                  content_type="application/pdf", size=4, data=b"%PDF"))
        self.s.commit()
        items = {a["id"]: a for a in self.items("client_info")}
        self.assertEqual(items["no_tax_certificate"]["count"], 1)  # Oom Piet only
        self.assertEqual(items["no_phone"]["count"], 1)
        self.assertEqual(items["no_address"]["count"], 1)
        self.assertIn("Oom Piet", items["no_tax_certificate"]["detail"])

    def test_nothing_to_say_when_every_client_is_complete(self):
        self.client.phone, self.client.address = "082 000 0000", "Plot 1"
        self.s.add(self.client)
        self.s.commit()
        self.s.add(ClientDocument(client_id=self.client.id, kind="tax_certificate", filename="x.pdf",
                                  content_type="application/pdf", size=4, data=b"%PDF"))
        self.s.commit()
        self.assertEqual(self.items("client_info"), [])


class ProgramMoneyTests(DashboardTestCase):
    def test_quoted_invoiced_and_paid_for_accepted_programs(self):
        prog = HerdingProgram(name="Kudde", client_id=self.client.id, mating_date=at(-3))
        self.s.add(prog)
        self.s.commit()
        quote = self.quote(10000, "Accepted", program_id=prog.id)
        draft = self.quote(5000, "Draft", program_id=prog.id)  # not agreed: not counted
        self.s.refresh(draft)
        paid = self.invoice(3000, "paid")
        owed = self.invoice(2000, "unpaid")
        step_a = ProgramStep(program_id=prog.id, stage="a", invoice_id=paid.id)
        step_b = ProgramStep(program_id=prog.id, stage="b", invoice_id=owed.id)
        self.s.add_all([step_a, step_b])
        self.s.commit()
        money = self.build()["program_money"]
        self.assertEqual((money["quoted"], money["invoiced"], money["paid"], money["still_to_invoice"]),
                         (10000.0, 5000.0, 3000.0, 5000.0))
        self.assertIsNotNone(quote.id)

    def test_no_programs_no_numbers(self):
        self.assertEqual(self.build()["program_money"], {"quoted": 0.0, "invoiced": 0.0, "paid": 0.0, "still_to_invoice": 0.0})


class TopListsTests(DashboardTestCase):
    def test_top_clients_by_revenue_in_the_last_twelve_months(self):
        other = Client(name="Oom Koos", farm_name="Klipfontein")
        self.s.add(other)
        self.s.commit()
        self.invoice(1000, "paid", -30)
        self.invoice(500, "unpaid", -60)
        self.invoice(5000, "paid", -30, client=other)
        self.invoice(9999, "cancelled", -30, client=other)
        self.invoice(7000, "paid", -400, client=other)  # too old
        top = self.build()["top_clients"]
        self.assertEqual([(t["name"], t["revenue"]) for t in top], [("Klipfontein", 5000.0), ("Oom Piet", 1500.0)])

    def test_top_products_by_what_was_sold(self):
        dip, vac = Product(name="Dip", price=100), Product(name="Vaccine", price=50)
        self.s.add_all([dip, vac])
        self.s.commit()
        inv = self.invoice(900, "paid", -10)
        old = self.invoice(900, "paid", -500)
        gone = self.invoice(900, "cancelled", -10)
        for invoice, product, qty, sub in ((inv, dip, 3, 300.0), (inv, vac, 10, 500.0), (old, dip, 99, 9900.0),
                                           (gone, dip, 50, 5000.0)):
            self.s.add(InvoiceItem(invoice_id=invoice.id, product_id=product.id, quantity=qty, unit_price=sub / qty, subtotal=sub))
        self.s.commit()
        top = self.build()["top_products"]
        self.assertEqual([(t["name"], t["quantity"], t["revenue"]) for t in top], [("Vaccine", 10.0, 500.0), ("Dip", 3.0, 300.0)])

    def test_at_most_five(self):
        for i in range(8):
            c = Client(name=f"Client {i}")
            self.s.add(c)
            self.s.commit()
            self.invoice(100 + i, "paid", -5, client=c)
        self.assertEqual(len(self.build()["top_clients"]), 5)


class LowStockTests(DashboardTestCase):
    def test_active_products_that_are_out_of_stock(self):
        self.s.add_all([Product(name="Dip", price=1, in_stock=False), Product(name="Drench", price=1, in_stock=True),
                        Product(name="Old", price=1, in_stock=False, is_active=False), Product(name="Plain", price=1)])
        self.s.commit()
        low = self.build()["low_stock"]
        self.assertEqual((low["count"], [p["name"] for p in low["items"]]), (1, ["Dip"]))


class RevenueByMonthTests(DashboardTestCase):
    def test_each_month_carries_the_same_month_a_year_earlier(self):
        now = datetime.utcnow()
        this = now.replace(day=5, hour=0, minute=0, second=0, microsecond=0)
        last_year = this.replace(year=this.year - 1)
        for when, total in ((this, 300.0), (last_year, 120.0)):
            self.s.add(Invoice(client_id=self.client.id, total_amount=total, status="paid", date=when))
        self.s.commit()
        months = analytics.get_revenue_by_month(months=3, session=self.s)
        last = months[-1]
        self.assertEqual((last["revenue"], last["previous_year"]), (300.0, 120.0))
        self.assertEqual(months[0]["previous_year"], 0.0)


if __name__ == "__main__":
    unittest.main()
