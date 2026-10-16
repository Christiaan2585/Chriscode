"""Editable message wording: the business can change what the app writes to clients (quote, invoice, reminder,
statement, program, treatments) in English and Afrikaans. Only known kinds and languages, safe text, and a blank
field means "use the standard wording"."""
import unittest

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from app import main  # noqa: F401 - registers every table
from app.api import business
from app.core import message_templates as mt
from app.core import statement_mail
from app.models.client import Client


class CleanTests(unittest.TestCase):
    def test_a_partial_override_is_kept_and_blank_means_default(self):
        cleaned = mt.clean({"en": {"quote": {"subject": " Your quote {number} ", "body": "Hi {name}!"}, "invoice": {"subject": "", "body": ""}}})
        self.assertEqual(cleaned, {"en": {"quote": {"subject": "Your quote {number}", "body": "Hi {name}!"}}})

    def test_one_field_can_be_overridden_alone(self):
        cleaned = mt.clean({"af": {"reminder": {"subject": "", "body": "Hallo {name}"}}})
        self.assertEqual(cleaned, {"af": {"reminder": {"body": "Hallo {name}"}}})

    def test_unknown_languages_and_kinds_are_refused(self):
        with self.assertRaises(ValueError):
            mt.clean({"fr": {"quote": {"subject": "x"}}})
        with self.assertRaises(ValueError):
            mt.clean({"en": {"spam": {"subject": "x"}}})
        with self.assertRaises(ValueError):
            mt.clean("not a dict")

    def test_a_subject_is_one_line_and_text_has_limits(self):
        self.assertEqual(mt.clean({"en": {"quote": {"subject": "Line one\r\nBcc: x@y.co"}}})["en"]["quote"]["subject"], "Line one Bcc: x@y.co")
        with self.assertRaises(ValueError):
            mt.clean({"en": {"quote": {"subject": "x" * 201}}})
        with self.assertRaises(ValueError):
            mt.clean({"en": {"quote": {"body": "x" * 2001}}})

    def test_a_body_keeps_its_line_breaks_but_no_control_characters(self):
        body = mt.clean({"en": {"treatments": {"body": "Hi {name}\n{dates}\x00\x07 bye"}}})["en"]["treatments"]["body"]
        self.assertEqual(body, "Hi {name}\n{dates} bye")

    def test_fill_replaces_only_known_placeholders(self):
        self.assertEqual(mt.fill("Hi {name}, {number} {unknown}", {"name": "Piet", "number": "QUO1"}), "Hi Piet, QUO1 {unknown}")
        self.assertEqual(mt.fill("Quote ({number}) {name}", {"name": "Piet", "number": ""}), "Quote Piet")  # empty brackets vanish


class StoredTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def test_saved_templates_come_back_with_the_business_settings(self):
        saved = business.save_message_templates(business.MessageTemplatesIn(templates={"af": {"quote": {"body": "Hallo {name}"}}}), session=self.s)
        self.assertEqual(saved, {"af": {"quote": {"body": "Hallo {name}"}}})
        self.assertEqual(business.read_business(session=self.s)["message_templates"], saved)

    def test_a_normal_business_edit_does_not_wipe_them(self):
        business.save_message_templates(business.MessageTemplatesIn(templates={"en": {"quote": {"subject": "Q {number}"}}}), session=self.s)
        current = business.read_business(session=self.s)
        business.update_business(business.BusinessSettingsUpdate(**{k: v for k, v in current.items() if k in business.BusinessSettingsUpdate.model_fields}), session=self.s)
        self.assertEqual(business.read_business(session=self.s)["message_templates"], {"en": {"quote": {"subject": "Q {number}"}}})

    def test_bad_templates_are_a_422(self):
        with self.assertRaises(HTTPException) as caught:
            business.save_message_templates(business.MessageTemplatesIn(templates={"xx": {}}), session=self.s)
        self.assertEqual(caught.exception.status_code, 422)

    def test_nothing_saved_reads_as_empty(self):
        self.assertEqual(business.read_business(session=self.s)["message_templates"], {})


class StatementWordingTests(unittest.TestCase):
    def test_the_bulk_statement_uses_the_business_wording_when_there_is_one(self):
        piet, sarie = Client(name="Piet"), Client(name="Sarie", language="af")
        templates = {"en": {"statement": {"subject": "Statement for {name}", "body": "Hi {name}, here it is."}}}
        self.assertEqual(statement_mail.statement_message(piet, templates), ("Statement for Piet", "Hi Piet, here it is."))
        self.assertEqual(statement_mail.statement_message(sarie, templates)[0], "U rekeningstaat")  # af not overridden
        self.assertEqual(statement_mail.statement_message(piet)[0], "Your statement of account")


if __name__ == "__main__":
    unittest.main()
