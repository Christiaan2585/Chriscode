"""Month-end statements: one email per chosen client with their statement PDF attached, in their language, skipping
clients with no address or nothing owing, carrying on past a refused address, stopping when the mail server is down,
and noting each send in the sent history."""
import io
import unittest
from datetime import date
from email import message_from_bytes, policy
from unittest import mock

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.core import field_crypto, mailer, reports, statement_mail
from app.models.client import Client
from app.models.mail import MailSettings
from app.models.sends import DocumentSend


class FakeSMTP:
    sent = []
    fail_for = set()
    down = False

    def __init__(self, host, port, timeout=None, context=None):
        if FakeSMTP.down:
            raise OSError("connection refused")

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


class StatementMailTests(unittest.TestCase):
    def setUp(self):
        FakeSMTP.sent, FakeSMTP.fail_for, FakeSMTP.down = [], set(), False
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self._real = (mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL)
        mailer.smtplib.SMTP = mailer.smtplib.SMTP_SSL = FakeSMTP
        self.s.add(MailSettings(id=1, host="smtp.example.com", port=587, security="starttls", username="o@example.com",
                                password=field_crypto.encrypt("pw"), from_address="o@example.com", from_name="Sandveld"))
        self.piet = Client(name="Piet", farm_name="Kraal", email="piet@example.com")
        self.sarie = Client(name="Sarie", farm_name="Dam", email="sarie@example.com", language="af")
        self.nomail = Client(name="Jan", farm_name="Berg")
        self.paidup = Client(name="Kobus", farm_name="Vlei", email="kobus@example.com")
        self.s.add_all([self.piet, self.sarie, self.nomail, self.paidup])
        self.s.commit()
        owing = {self.piet.id: 1200.0, self.sarie.id: 300.5, self.nomail.id: 50.0, self.paidup.id: 0.0}
        for patcher in (
            mock.patch.object(reports, "statement_pdf", side_effect=lambda session, cid, start, end: io.BytesIO(b"%PDF-1.4 statement " + str(cid).encode())),  # like the real one: a buffer, not bytes
            mock.patch.object(reports, "client_statement", side_effect=lambda session, cid, start, end: {"closing_balance": owing[cid]}),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self):
        mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL = self._real
        self.s.close()
        self.engine.dispose()

    def run_for(self, *clients):
        return statement_mail.email_statements(self.s, [c.id for c in clients], date(2026, 9, 1), date(2026, 9, 30))

    def test_each_client_gets_their_statement_attached(self):
        result = self.run_for(self.piet)
        self.assertEqual([r["email"] for r in result["sent"]], ["piet@example.com"])
        msg = FakeSMTP.sent[0]
        self.assertEqual(msg["Subject"], "Your statement of account")
        self.assertIn("Good day Piet", msg.get_body(("plain",)).get_content())
        attachment = list(msg.iter_attachments())[0]
        self.assertEqual(attachment.get_content_type(), "application/pdf")
        self.assertTrue(attachment.get_content().startswith(b"%PDF"))
        self.assertIn("Kraal", attachment.get_filename())

    def test_an_afrikaans_client_gets_afrikaans(self):
        self.run_for(self.sarie)
        msg = FakeSMTP.sent[0]
        self.assertEqual(msg["Subject"], "U rekeningstaat")
        self.assertIn("Goeie dag Sarie", msg.get_body(("plain",)).get_content())

    def test_no_address_or_nothing_owing_is_skipped_with_a_reason(self):
        result = self.run_for(self.nomail, self.paidup, self.piet)
        self.assertEqual(len(FakeSMTP.sent), 1)
        reasons = {r["name"]: r["reason"] for r in result["skipped"]}
        self.assertEqual(reasons, {"Berg": "No email address", "Vlei": "Nothing owing"})

    def test_a_refused_address_is_listed_and_the_rest_still_go(self):
        FakeSMTP.fail_for = {"piet@example.com"}
        result = self.run_for(self.piet, self.sarie)
        self.assertEqual([r["name"] for r in result["failed"]], ["Kraal"])
        self.assertEqual([r["name"] for r in result["sent"]], ["Dam"])

    def test_a_dead_mail_server_stops_and_lists_who_was_not_sent(self):
        FakeSMTP.down = True
        result = self.run_for(self.piet, self.sarie)
        self.assertEqual(result["sent"], [])
        self.assertIsNotNone(result["stopped"])
        self.assertEqual([r["name"] for r in result["not_sent"]], ["Kraal", "Dam"])

    def test_each_send_is_noted_in_the_sent_history(self):
        self.run_for(self.piet)
        row = self.s.exec(select(DocumentSend)).one()
        self.assertEqual((row.kind, row.via, row.client_id, row.to_address), ("statement", "app-email", self.piet.id, "piet@example.com"))

    def test_too_many_clients_or_no_mail_setup_is_refused(self):
        with self.assertRaises(HTTPException) as caught:
            statement_mail.email_statements(self.s, list(range(1, 202)), date(2026, 9, 1), date(2026, 9, 30))
        self.assertEqual(caught.exception.status_code, 422)
        self.s.delete(self.s.get(MailSettings, 1))
        self.s.commit()
        with self.assertRaises(HTTPException) as caught:
            self.run_for(self.piet)
        self.assertEqual(caught.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
