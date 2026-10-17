"""The 1.0.20 everyday helpers: duplicate-client warnings, today's summary, bulk payment reminders, the note author and
the limited-staff role."""
import unittest
from datetime import date, datetime, timedelta
from unittest import mock

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.api import clients as clients_api, notes as notes_api, products as products_api
from app.core import duplicates, field_crypto, mailer, reminder_mail, today
from app.core.security import require_full_access
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.note import ClientNote
from app.models.mail import MailSettings
from app.models.payment import Payment
from app.models.product import Product
from app.models.quote import Quote
from app.models.sends import DocumentSend
from app.models.user import User
from tests.test_statement_mail import FakeSMTP


class Base(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def client(self, **kw):
        c = Client(**{"name": "Piet", **kw})
        self.s.add(c)
        self.s.commit()
        self.s.refresh(c)
        return c


class DuplicateTests(Base):
    def test_a_matching_phone_ignores_spaces_and_the_country_code(self):
        a = self.client(name="Piet", phone="082 555 1234")
        found = duplicates.find(self.s, name="Someone else", phone="+27 82 555 1234")
        self.assertEqual([f["id"] for f in found], [a.id])
        self.assertIn("same phone number", found[0]["why"])

    def test_email_and_farm_match_without_capitals(self):
        a = self.client(email="Piet@Example.com", farm_name="Kraal Plaas")
        self.assertEqual(len(duplicates.find(self.s, email="piet@example.com")), 1)
        self.assertEqual(len(duplicates.find(self.s, farm_name=" kraal  plaas ")), 1)
        self.assertEqual(duplicates.find(self.s, email="other@example.com", farm_name="Elders"), [])
        self.assertEqual(a.id, duplicates.find(self.s, email="piet@example.com")[0]["id"])

    def test_the_client_being_edited_is_not_its_own_duplicate(self):
        a = self.client(phone="0825551234")
        self.assertEqual(duplicates.find(self.s, phone="0825551234", exclude_id=a.id), [])

    def test_short_or_empty_numbers_never_match(self):
        self.client(phone="123")
        self.assertEqual(duplicates.find(self.s, phone="123"), [])
        self.assertEqual(duplicates.find(self.s), [])

    def test_the_route_returns_the_matches(self):
        a = self.client(email="a@example.com")
        out = clients_api.find_duplicates(email="a@example.com", session=self.s)
        self.assertEqual([m["id"] for m in out], [a.id])


class TodayTests(Base):
    def test_todays_work_is_counted_and_other_days_are_not(self):
        c = self.client()
        now = datetime(2026, 10, 17, 10, 0)
        inv = Invoice(client_id=c.id, total_amount=300, date=now)
        old = Invoice(client_id=c.id, total_amount=999, date=now - timedelta(days=3))
        cancelled = Invoice(client_id=c.id, total_amount=50, date=now, status="cancelled")
        self.s.add_all([inv, old, cancelled])
        self.s.commit()
        self.s.add(Payment(invoice_id=inv.id, client_id=c.id, amount=120, date=now))
        self.s.add(Payment(invoice_id=old.id, client_id=c.id, amount=77, date=now - timedelta(days=2)))
        self.s.add(Quote(client_id=c.id, total_amount=10, status="Sent", date=now))
        self.s.add(DocumentSend(kind="quote", via="email", at=now))
        self.s.add(DocumentSend(kind="invoice", via="whatsapp", at=now))
        self.s.add(DocumentSend(kind="quote", via="email", at=now - timedelta(days=1)))
        self.s.commit()
        out = today.summary(self.s, date(2026, 10, 17))
        self.assertEqual(out["invoices"], {"count": 2 - 1, "total": 300.0})  # the cancelled one is not counted
        self.assertEqual(out["payments"], {"count": 1, "total": 120.0})
        self.assertEqual(out["sent"], 2)
        self.assertEqual(out["new_clients"], 1)

    def test_waiting_counts_overdue_invoices_and_quotes_sent(self):
        c = self.client()
        self.s.add(Invoice(client_id=c.id, total_amount=100, date=datetime(2026, 8, 1), due_date=datetime(2026, 9, 1)))
        self.s.add(Quote(client_id=c.id, total_amount=10, status="Sent", date=datetime(2026, 10, 1)))
        self.s.commit()
        out = today.summary(self.s, date(2026, 10, 17))
        self.assertEqual(out["waiting"], {"overdue_invoices": 1, "overdue_total": 100.0, "quotes": 1})


class ReminderMailTests(Base):
    def setUp(self):
        super().setUp()
        FakeSMTP.sent, FakeSMTP.fail_for, FakeSMTP.down = [], set(), False
        self._real = (mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL)
        mailer.smtplib.SMTP = mailer.smtplib.SMTP_SSL = FakeSMTP
        self.s.add(MailSettings(id=1, host="smtp.example.com", port=587, security="starttls", username="o@example.com",
                                password=field_crypto.encrypt("pw"), from_address="o@example.com", from_name="Sandveld"))
        self.s.commit()
        self.today = date(2026, 10, 17)

    def tearDown(self):
        mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL = self._real
        super().tearDown()

    def overdue(self, client, **kw):
        inv = Invoice(client_id=client.id, total_amount=250, number="INV0000001", date=datetime(2026, 8, 1),
                      due_date=datetime(2026, 9, 1), **kw)
        self.s.add(inv)
        self.s.commit()
        self.s.refresh(inv)
        return inv

    def test_overdue_invoices_are_found_with_what_is_owed(self):
        c = self.client(email="p@example.com")
        inv = self.overdue(c)
        self.s.add(Payment(invoice_id=inv.id, client_id=c.id, amount=50))
        self.s.add(Invoice(client_id=c.id, total_amount=10, date=datetime(2026, 10, 10), due_date=datetime(2026, 11, 1)))
        self.s.commit()
        rows = reminder_mail.overdue_invoices(self.s, self.today)
        self.assertEqual([(r["invoice_id"], r["owed"]) for r in rows], [(inv.id, 200.0)])

    def test_each_overdue_invoice_gets_one_email_with_the_invoice_attached(self):
        piet = self.client(email="piet@example.com")
        sarie = self.client(name="Sarie", email="sarie@example.com", language="af")
        a, b = self.overdue(piet), self.overdue(sarie)
        with mock.patch.object(reminder_mail, "invoice_pdf", return_value=b"%PDF-1.4 fake"):
            result = reminder_mail.email_reminders(self.s, [a.id, b.id], self.today)
        self.assertEqual(len(result["sent"]), 2)
        subjects = sorted(m["Subject"] for m in FakeSMTP.sent)
        self.assertEqual(subjects, ["Betalingsherinnering - faktuur INV0000001", "Payment reminder - invoice INV0000001"])
        self.assertEqual([s.kind for s in self.s.exec(select(DocumentSend)).all()], ["reminder", "reminder"])

    def test_no_address_not_overdue_and_paid_are_skipped_with_a_reason(self):
        none = self.client(name="None")
        self.overdue(none)
        paid = self.client(name="Paid", email="paid@example.com")
        p = self.overdue(paid)
        self.s.add(Payment(invoice_id=p.id, client_id=paid.id, amount=250))
        self.s.commit()
        fresh = self.client(name="Fresh", email="f@example.com")
        f = Invoice(client_id=fresh.id, total_amount=5, date=datetime(2026, 10, 10), due_date=datetime(2026, 11, 1))
        self.s.add(f)
        self.s.commit()
        ids = [i.id for i in self.s.exec(select(Invoice)).all()]
        with mock.patch.object(reminder_mail, "invoice_pdf", return_value=b"%PDF-1.4 fake"):
            result = reminder_mail.email_reminders(self.s, ids, self.today)
        self.assertEqual(result["sent"], [])
        self.assertEqual(sorted(s["reason"] for s in result["skipped"]),
                         ["No email address", "Not overdue", "Nothing owing"])

    def test_a_refused_address_is_listed_and_the_rest_go(self):
        bad = self.client(email="bad@example.com")
        good = self.client(name="Good", email="good@example.com")
        a, b = self.overdue(bad), self.overdue(good)
        FakeSMTP.fail_for = {"bad@example.com"}
        with mock.patch.object(reminder_mail, "invoice_pdf", return_value=b"%PDF-1.4 fake"):
            result = reminder_mail.email_reminders(self.s, [a.id, b.id], self.today)
        self.assertEqual(len(result["failed"]), 1)
        self.assertEqual(len(result["sent"]), 1)

    def test_a_dead_mail_server_stops_the_run_and_lists_who_was_not_sent(self):
        c = self.client(email="c@example.com")
        a = self.overdue(c)
        FakeSMTP.down = True
        with mock.patch.object(reminder_mail, "invoice_pdf", return_value=b"%PDF-1.4 fake"):
            result = reminder_mail.email_reminders(self.s, [a.id], self.today)
        self.assertTrue(result["stopped"])
        self.assertEqual(len(result["not_sent"]), 1)

    def test_email_must_be_set_up(self):
        self.s.delete(self.s.get(MailSettings, 1))
        self.s.commit()
        with self.assertRaises(HTTPException) as ctx:
            reminder_mail.email_reminders(self.s, [1], self.today)
        self.assertEqual(ctx.exception.status_code, 409)


class NoteAuthorTests(Base):
    def test_the_author_is_the_signed_in_user_not_the_request(self):
        c = self.client()
        me = User(name="Anna", email="a@example.com")
        note = notes_api.create_note(ClientNote(client_id=c.id, content="Phoned, will pay Friday", kind="call", author="Someone Else"),
                                     session=self.s, user=me)
        self.assertEqual((note.author, note.kind), ("Anna", "call"))

    def test_only_notes_and_calls_exist(self):
        c = self.client()
        with self.assertRaises(HTTPException) as ctx:
            notes_api.create_note(ClientNote(client_id=c.id, content="x", kind="other"), session=self.s,
                                  user=User(name="A", email="a@example.com"))
        self.assertEqual(ctx.exception.status_code, 422)


class LimitedStaffTests(Base):
    def test_a_limited_user_does_not_get_the_cost_price(self):
        self.s.add(Product(name="Drench", price=57.5, cost=40.0, price_excl_vat=50.0))
        self.s.commit()
        full = User(name="Boss", email="b@example.com", is_admin=True)
        limited = User(name="Temp", email="t@example.com", limited=True)
        self.assertEqual(products_api.read_products(session=self.s, user=full)[0].cost, 40.0)
        out = products_api.read_products(session=self.s, user=limited)
        self.assertIsNone(out[0].cost)
        self.assertEqual(out[0].price_excl_vat, 50.0)
        self.assertEqual(self.s.exec(select(Product)).first().cost, 40.0)  # the stored cost is untouched

    def test_a_limited_user_cannot_overwrite_the_cost_but_can_change_the_price(self):
        self.s.add(Product(name="Drench", price=57.5, cost=40.0, price_excl_vat=50.0))
        self.s.commit()
        limited = User(name="Temp", email="t@example.com", limited=True)
        out = products_api.patch_product(1, products_api.ProductPatch(cost=1.0, price_excl_vat=60.0), session=self.s, user=limited)
        self.assertIsNone(out.cost)
        self.assertEqual(out.price_excl_vat, 60.0)
        self.assertEqual(self.s.get(Product, 1).cost, 40.0)

    def test_the_price_list_import_and_aged_debtors_need_full_access(self):
        from app.api import reports as reports_api
        def gated(router, path, method):
            route = next(r for r in router.routes if r.path.endswith(path) and method in r.methods)
            return any(d.call is require_full_access for d in route.dependant.dependencies)
        self.assertTrue(gated(products_api.router, "/import", "POST"))
        self.assertTrue(gated(reports_api.router, "/aged-debtors", "GET"))

    def test_money_reports_are_refused_to_a_limited_user(self):
        with self.assertRaises(HTTPException) as ctx:
            require_full_access(User(name="Temp", email="t@example.com", limited=True))
        self.assertEqual(ctx.exception.status_code, 403)
        user = User(name="Ok", email="o@example.com")
        self.assertIs(require_full_access(user), user)


if __name__ == "__main__":
    unittest.main()
