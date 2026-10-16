"""Sent history: every time a quote, invoice, statement, reminder or program goes to a client (WhatsApp, email or
'send from the app') one line is kept, so the lists can say "Sent by email, 16 Oct" and nobody wonders."""
import unittest
from datetime import datetime, timedelta

from pydantic import ValidationError
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import sends
from app.core import cascade
from app.models.client import Client
from app.models.user import User
from app.models.sends import DocumentSend
from app.models import invoice, quote, order, purchase_order, program, herd, appointment, schedule, weight, note, animal  # noqa: F401


class SendsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Piet")
        self.rep = User(name="Sarah", email="s@x.co", password_hash="x")
        self.s.add_all([self.client, self.rep])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def record(self, **fields):
        body = {"kind": "quote", "via": "email", "doc_id": 5, "client_id": self.client.id, **fields}
        return sends.record_send(sends.SendIn(**body), session=self.s, user=self.rep)

    def test_a_send_is_kept_with_who_how_and_when(self):
        row = self.record(to="piet@example.com")
        self.assertEqual((row.kind, row.via, row.doc_id, row.to_address), ("quote", "email", 5, "piet@example.com"))
        self.assertEqual(row.by_user_id, self.rep.id)
        self.assertLess(abs(datetime.utcnow() - row.at), timedelta(seconds=5))

    def test_only_known_kinds_and_ways_are_accepted(self):
        with self.assertRaises(ValidationError):
            sends.SendIn(kind="spam", via="email")
        with self.assertRaises(ValidationError):
            sends.SendIn(kind="quote", via="pigeon")

    def test_the_address_is_cleaned_and_limited(self):
        row = self.record(to="  a@b.co\r\nBcc: x@y.co  ")
        self.assertEqual(row.to_address, "a@b.co Bcc: x@y.co")
        self.assertIsNone(self.record(to="").to_address)
        with self.assertRaises(ValidationError):
            sends.SendIn(kind="quote", via="email", to="x" * 300)

    def test_latest_is_the_newest_send_per_document(self):
        old = self.record(via="whatsapp")
        old.at = datetime.utcnow() - timedelta(days=3)
        self.s.add(old); self.s.commit()
        self.record(via="email", to="p@x.co")
        self.record(doc_id=6, via="whatsapp")
        latest = sends.latest_sends(kind="quote", session=self.s)
        self.assertEqual(latest["5"]["via"], "email")
        self.assertEqual(latest["5"]["to"], "p@x.co")
        self.assertEqual(latest["5"]["by"], "Sarah")
        self.assertEqual(latest["6"]["via"], "whatsapp")

    def test_kinds_do_not_mix(self):
        self.record(kind="quote", doc_id=5)
        self.record(kind="invoice", doc_id=5, via="whatsapp")
        self.assertEqual(sends.latest_sends(kind="invoice", session=self.s)["5"]["via"], "whatsapp")
        self.assertEqual(sends.latest_sends(kind="reminder", session=self.s), {})

    def test_forgetting_a_document_removes_its_history(self):
        self.record(kind="invoice", doc_id=9)
        self.record(kind="quote", doc_id=9)
        sends.forget(self.s, "invoice", 9)
        self.s.commit()
        self.assertEqual(sends.latest_sends(kind="invoice", session=self.s), {})
        self.assertIn("9", sends.latest_sends(kind="quote", session=self.s))

    def test_deleting_a_client_removes_what_was_sent_to_them(self):
        self.record()
        cascade.delete_client(self.s, self.client)
        self.s.commit()
        self.assertEqual(self.s.exec(select(DocumentSend)).all(), [])


if __name__ == "__main__":
    unittest.main()
