"""A client's language ("en" or "af"): what the app writes to them (quotes, invoices, reminders). Blank = English."""
import unittest

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from app.api import clients
from app.models.client import Client
from app.models import user, invoice, quote, order, purchase_order, program, herd, appointment, schedule, weight, note  # noqa: F401


class ClientLanguageTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def make(self, **fields):
        return clients.create_client(Client(name="Piet", **fields), session=self.s)

    def test_afrikaans_is_kept(self):
        self.assertEqual(self.make(language="af").language, "af")

    def test_blank_or_missing_means_english(self):
        self.assertIsNone(self.make().language)
        self.assertIsNone(self.make(language="").language)
        self.assertEqual(self.make(language="EN ").language, "en")

    def test_other_languages_are_refused(self):
        with self.assertRaises(HTTPException) as caught:
            self.make(language="fr")
        self.assertEqual(caught.exception.status_code, 422)

    def test_an_edit_can_change_and_clear_it(self):
        client = self.make(language="af")
        edited = clients.update_client(client.id, Client(name="Piet", language="en"), session=self.s)
        self.assertEqual(edited.language, "en")
        cleared = clients.update_client(client.id, Client(name="Piet", language=""), session=self.s)
        self.assertIsNone(cleared.language)

    def test_an_edit_that_does_not_mention_it_keeps_it(self):
        client = self.make(language="af")
        clients.update_client(client.id, Client(name="Piet Nel"), session=self.s)
        self.assertEqual(self.s.get(Client, client.id).language, "af")


if __name__ == "__main__":
    unittest.main()
