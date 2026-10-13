"""Sending a brochure (a PDF in the catalogue library) to several chosen clients: one email each with the PDF attached
and their own name in the greeting, who was skipped and why, what is remembered about who got it, and what happens
when the mail server is down."""
import tempfile
import unittest
from email import message_from_bytes, policy
from unittest import mock

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.api import catalogue
from app.core import brochures, catalogue_library as lib, field_crypto, kyron_catalogue as kc, mailer
from app.models.brochure import BrochureSend
from app.models.client import Client
from app.models.mail import MailSettings
from tests.test_kyron_catalogue import made_up_book


class FakeSMTP:
    sent = []
    fail_for = set()

    def __init__(self, host, port, timeout=None, context=None):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        pass

    def login(self, user, password):
        pass

    def send_message(self, message):
        import smtplib
        if message["To"] in FakeSMTP.fail_for:
            raise smtplib.SMTPRecipientsRefused({message["To"]: (550, b"no such user")})
        FakeSMTP.sent.append(message)


class BrochureCase(unittest.TestCase):
    def setUp(self):
        FakeSMTP.sent, FakeSMTP.fail_for = [], set()
        self.dir = tempfile.mkdtemp()
        for patcher in (mock.patch.object(kc, "catalogue_dir", return_value=self.dir),):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self._real = (mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL)
        mailer.smtplib.SMTP = mailer.smtplib.SMTP_SSL = FakeSMTP
        self.s.add(MailSettings(id=1, host="smtp.example.com", port=587, security="starttls", username="o@example.com",
                                password=field_crypto.encrypt("pw"), from_address="o@example.com", from_name="Sandveld"))
        self.jan = Client(name="Jan Smit", email="jan@example.com")
        self.piet = Client(name="Piet Botha", email="piet@example.com")
        self.sue = Client(name="Sue Nel", email=None, phone="0821234567")
        self.s.add_all([self.jan, self.piet, self.sue])
        self.s.commit()
        self.brochure = lib.add_catalogue(made_up_book(), "attila.pdf", "Attila brochure")

    def tearDown(self):
        mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL = self._real
        self.s.close()
        self.engine.dispose()

    def send(self, clients, subject="Our new product", message="Good day {name}, see the brochure."):
        return brochures.email_to_clients(self.s, self.brochure["id"], [c.id for c in clients], subject, message)


class EmailTests(BrochureCase):
    def test_each_chosen_client_gets_the_pdf_with_their_own_name(self):
        out = self.send([self.jan, self.piet])
        self.assertEqual([r["client_id"] for r in out["sent"]], [self.jan.id, self.piet.id])
        bodies = {m["To"]: message_from_bytes(m.as_bytes(), policy=policy.default) for m in FakeSMTP.sent}
        self.assertIn("Good day Jan Smit", bodies["jan@example.com"].get_body().get_content())
        self.assertIn("Good day Piet Botha", bodies["piet@example.com"].get_body().get_content())
        [part] = list(bodies["jan@example.com"].iter_attachments())
        self.assertEqual(part.get_content_type(), "application/pdf")
        self.assertTrue(part.get_content().startswith(b"%PDF"))
        self.assertEqual(part.get_filename(), "Attila brochure.pdf")

    def test_a_client_without_an_email_is_skipped_and_named(self):
        out = self.send([self.jan, self.sue])
        self.assertEqual([r["client_id"] for r in out["sent"]], [self.jan.id])
        self.assertEqual([(r["client_id"], r["reason"]) for r in out["skipped"]], [(self.sue.id, "No email address")])

    def test_a_refused_address_is_reported_and_the_others_still_go(self):
        FakeSMTP.fail_for = {"jan@example.com"}
        out = self.send([self.jan, self.piet])
        self.assertEqual([r["client_id"] for r in out["failed"]], [self.jan.id])
        self.assertEqual([r["client_id"] for r in out["sent"]], [self.piet.id])
        self.assertIsNone(out["stopped"])

    def test_a_server_that_is_down_stops_at_once_instead_of_trying_every_client(self):
        class Down(FakeSMTP):
            calls = 0

            def __init__(self, *a, **k):
                Down.calls += 1
                raise OSError("down")
        mailer.smtplib.SMTP = Down
        out = self.send([self.jan, self.piet])
        self.assertEqual(Down.calls, 1)
        self.assertEqual(out["sent"], [])
        self.assertIn("mail server", out["stopped"])
        self.assertEqual([r["client_id"] for r in out["not_sent"]], [self.jan.id, self.piet.id])

    def test_sent_ones_are_remembered_and_failed_ones_are_not(self):
        FakeSMTP.fail_for = {"jan@example.com"}
        self.send([self.jan, self.piet])
        rows = self.s.exec(select(BrochureSend)).all()
        self.assertEqual([(r.client_id, r.via) for r in rows], [(self.piet.id, "email")])

    def test_nothing_is_sent_if_email_is_not_set_up(self):
        self.s.delete(self.s.get(MailSettings, 1))
        self.s.commit()
        with self.assertRaises(HTTPException) as ctx:
            self.send([self.jan])
        self.assertEqual(ctx.exception.status_code, 409)

    def test_an_unknown_brochure_or_too_many_clients_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            brochures.email_to_clients(self.s, "0" * 32, [self.jan.id], "s", "m")
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            brochures.email_to_clients(self.s, self.brochure["id"], list(range(1, brochures.MAX_CLIENTS + 2)), "s", "m")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_the_same_client_ticked_twice_gets_one_email(self):
        self.send([self.jan, self.jan])
        self.assertEqual(len(FakeSMTP.sent), 1)


class HistoryTests(BrochureCase):
    def test_a_whatsapp_send_can_be_noted_and_the_latest_per_client_is_listed(self):
        brochures.record_send(self.s, self.brochure["id"], self.sue.id, "whatsapp")
        self.send([self.jan])
        latest = brochures.latest_sends(self.s, self.brochure["id"])
        self.assertEqual(latest[self.sue.id]["via"], "whatsapp")
        self.assertEqual(latest[self.jan.id]["via"], "email")

    def test_a_note_for_a_client_that_does_not_exist_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            brochures.record_send(self.s, self.brochure["id"], 9999, "whatsapp")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_deleting_the_brochure_forgets_who_got_it(self):
        self.send([self.jan])
        catalogue.delete_from_library(self.brochure["id"], session=self.s)
        self.assertEqual(self.s.exec(select(BrochureSend)).all(), [])

    def test_the_send_routes_exist_for_signed_in_staff_not_only_admins(self):
        from app.core.security import require_admin
        deps = {(r.path, tuple(sorted(r.methods))): [d.dependency for d in r.dependencies] for r in catalogue.router.routes}
        for key, found in deps.items():
            if key[0].endswith("/email") or key[0].endswith("/sent") or key[0].endswith("/sends"):
                self.assertNotIn(require_admin, found, key)


if __name__ == "__main__":
    unittest.main()
