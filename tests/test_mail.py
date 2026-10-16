"""Email from the app through the business's own mail server (SMTP): settings (password kept encrypted, never shown
again), the message that gets built, and what is refused."""
import unittest
from email import message_from_bytes, policy

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.api import mail as mail_api
from app.core import field_crypto, mailer
from app.models.mail import MailSettings

PDF = b"%PDF-1.4\n%fake\n"


class FakeSMTP:
    sent = []
    log = []

    def __init__(self, host, port, timeout=None, context=None):
        FakeSMTP.log.append(("connect", host, port, bool(context)))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        FakeSMTP.log.append(("starttls",))

    def login(self, user, password):
        FakeSMTP.log.append(("login", user, password))

    def send_message(self, message):
        FakeSMTP.sent.append(message)


class MailCase(unittest.TestCase):
    def setUp(self):
        FakeSMTP.sent, FakeSMTP.log = [], []
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self._real = (mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL)
        mailer.smtplib.SMTP = mailer.smtplib.SMTP_SSL = FakeSMTP

    def tearDown(self):
        mailer.smtplib.SMTP, mailer.smtplib.SMTP_SSL = self._real
        self.s.close()
        self.engine.dispose()

    def configure(self, **extra):
        body = dict(host="smtp.example.com", port=587, security="starttls", username="office@example.com",
                    password="s3cret pass", from_address="office@example.com", from_name="Sandveld Vee Dienste")
        body.update(extra)
        return mail_api.save_settings(mail_api.MailSettingsIn(**body), session=self.s)


class SettingsTests(MailCase):
    def test_the_password_is_stored_encrypted_and_never_returned(self):
        out = self.configure()
        self.assertNotIn("password", out)
        self.assertTrue(out["has_password"])
        stored = self.s.get(MailSettings, 1).password
        self.assertTrue(stored.startswith(field_crypto.PREFIX))
        self.assertNotIn("s3cret", stored)
        self.assertNotIn("s3cret", str(mail_api.read_settings(session=self.s)))

    def test_saving_again_without_a_password_keeps_the_old_one(self):
        self.configure()
        self.configure(password=None, from_name="Kantoor")
        self.assertEqual(field_crypto.decrypt(self.s.get(MailSettings, 1).password), "s3cret pass")

    def test_the_saved_password_is_never_handed_to_a_different_server_or_user(self):
        self.configure()
        for change in (dict(host="evil.example.net"), dict(username="someone@else.com"), dict(host="SMTP.EXAMPLE.COM.evil.net")):
            with self.assertRaises(HTTPException) as ctx:
                self.configure(password=None, **change)
            self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(self.s.get(MailSettings, 1).host, "smtp.example.com")  # the refused change was not saved
        self.configure(password="new password", host="evil.example.net")  # typing the password again is allowed
        self.assertEqual(field_crypto.decrypt(self.s.get(MailSettings, 1).password), "new password")

    def test_the_same_server_in_other_capitals_keeps_the_password(self):
        self.configure()
        self.configure(password=None, host="SMTP.Example.com")
        self.assertEqual(field_crypto.decrypt(self.s.get(MailSettings, 1).password), "s3cret pass")

    def test_status_says_whether_sending_is_set_up(self):
        self.assertFalse(mail_api.status(session=self.s)["configured"])
        self.configure()
        self.assertTrue(mail_api.status(session=self.s)["configured"])

    def test_a_port_or_security_that_makes_no_sense_is_refused(self):
        for bad in (dict(port=0), dict(port=70000), dict(security="plain-and-open")):
            with self.assertRaises(Exception):
                self.configure(**bad)

    def test_the_settings_routes_are_admin_only_but_status_is_for_everyone_signed_in(self):
        from app.core.security import require_admin
        deps = {r.path: [d.dependency for d in r.dependencies] for r in mail_api.router.routes}
        self.assertIn(require_admin, deps["/mail/settings"])
        self.assertIn(require_admin, deps["/mail/test"])
        self.assertNotIn(require_admin, deps["/mail/status"])


class SendTests(MailCase):
    def send(self, to="client@example.com", pdf=PDF, filename="Invoice INV1.pdf", subject="Your invoice", message="Please find it attached."):
        return mailer.send_document(self.s, to=to, subject=subject, message=message, filename=filename, pdf=pdf)

    def test_a_pdf_is_sent_as_an_attachment_from_the_business(self):
        self.configure()
        self.send()
        [msg] = FakeSMTP.sent
        parsed = message_from_bytes(msg.as_bytes(), policy=policy.default)
        self.assertEqual(parsed["To"], "client@example.com")
        self.assertIn("office@example.com", parsed["From"])
        self.assertEqual(parsed["Subject"], "Your invoice")
        [part] = list(parsed.iter_attachments())
        self.assertEqual((part.get_filename(), part.get_content_type()), ("Invoice INV1.pdf", "application/pdf"))
        self.assertEqual(part.get_content(), PDF)
        self.assertIn(("starttls",), FakeSMTP.log)
        self.assertIn(("login", "office@example.com", "s3cret pass"), FakeSMTP.log)

    def test_a_message_can_go_without_an_attachment(self):
        # Treatment reminders are plain messages: POST /mail/send with no file.
        import asyncio
        self.configure()
        asyncio.run(mail_api.send(to="client@example.com", subject="Dates", message="- 24 Oct: dosing", file=None, session=self.s))
        [msg] = FakeSMTP.sent
        parsed = message_from_bytes(msg.as_bytes(), policy=policy.default)
        self.assertEqual(list(parsed.iter_attachments()), [])
        self.assertIn("24 Oct", parsed.get_body(("plain",)).get_content())

    def test_ssl_security_connects_straight_over_tls(self):
        self.configure(port=465, security="ssl")
        self.send()
        self.assertNotIn(("starttls",), FakeSMTP.log)
        self.assertTrue(FakeSMTP.log[0][3])  # a verifying TLS context was handed in

    def test_not_set_up_is_a_clear_409(self):
        with self.assertRaises(HTTPException) as ctx:
            self.send()
        self.assertEqual(ctx.exception.status_code, 409)

    def test_bad_addresses_are_refused_including_header_injection(self):
        self.configure()
        for bad in ("", "nobody", "a@b", "x@example.com, y@example.com", "x@example.com\nBcc: boss@example.com"):
            with self.assertRaises(HTTPException) as ctx:
                self.send(to=bad)
            self.assertEqual(ctx.exception.status_code, 422, bad)
        self.assertEqual(FakeSMTP.sent, [])

    def test_only_a_real_pdf_within_the_size_limit_is_attached(self):
        self.configure()
        with self.assertRaises(HTTPException):
            self.send(pdf=b"MZ not a pdf")
        with self.assertRaises(HTTPException):
            self.send(pdf=PDF + b"x" * mailer.MAX_ATTACHMENT_BYTES)

    def test_the_file_name_and_subject_cannot_smuggle_headers(self):
        self.configure()
        self.send(filename="..\\..\\evil\r\nBcc: x@example.com.pdf", subject="Hi\r\nBcc: boss@example.com")
        parsed = message_from_bytes(FakeSMTP.sent[0].as_bytes(), policy=policy.default)
        self.assertIsNone(parsed["Bcc"])
        self.assertNotIn("\n", parsed["Subject"])
        self.assertNotIn("\\", list(parsed.iter_attachments())[0].get_filename())

    def test_a_server_that_cannot_be_reached_gives_a_readable_502(self):
        self.configure()

        class Down(FakeSMTP):
            def __init__(self, *a, **k):
                raise OSError("connection refused")
        mailer.smtplib.SMTP = Down
        with self.assertRaises(HTTPException) as ctx:
            self.send()
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertNotIn("s3cret", str(ctx.exception.detail))


if __name__ == "__main__":
    unittest.main()
