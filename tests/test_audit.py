"""The activity log: who did what, when - never the data itself."""
import asyncio
import json
import unittest
from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.api import audit as audit_api
from app.api import auth
from app.core import audit
from app.core.db import get_session
from app.core.security import create_access_token, hash_secret
from app.models.audit import AuditEntry
from app.models.user import User
from tests.test_lan import Client


class DescribeTests(unittest.TestCase):
    def check(self, method, path, action, entity, entity_id=None):
        got = audit.describe(method, path)
        self.assertEqual((got["action"], got["entity"], got["entity_id"]), (action, entity, entity_id), (method, path))

    def test_the_usual_changes_read_naturally(self):
        self.check("POST", "/clients/", "Added client", "client")
        self.check("PUT", "/clients/5", "Changed client", "client", "5")
        self.check("PATCH", "/products/12", "Changed product", "product", "12")
        self.check("DELETE", "/invoices/7", "Deleted invoice", "invoice", "7")
        self.check("DELETE", "/purchase-orders/3", "Deleted purchase order", "purchase order", "3")
        self.check("POST", "/quotes/", "Added quote", "quote")

    def test_things_inside_something_are_named_by_what_they_are(self):
        self.check("PATCH", "/programs/3/steps/9", "Changed herding program (steps)", "herding program", "3")
        self.check("DELETE", "/programs/3/lines/4", "Deleted from herding program (lines)", "herding program", "3")
        self.check("PUT", "/clients/5/tax-certificate", "Added tax certificate to client", "client", "5")
        self.check("DELETE", "/clients/5/tax-certificate", "Deleted tax certificate from client", "client", "5")

    def test_special_actions_have_their_own_words(self):
        self.check("POST", "/backups/restore", "Restored a backup", "backup")
        self.check("POST", "/backups/run", "Ran a backup", "backup")
        self.check("GET", "/exports/workbook", "Exported all data to Excel", "export")
        self.check("POST", "/auth/users", "Added a staff account", "user")
        self.check("DELETE", "/auth/users/4", "Deactivated a staff account", "user", "4")
        self.check("POST", "/auth/users/4/reset-password", "Reset a staff password", "user", "4")
        self.check("POST", "/auth/users/4/unlock", "Unlocked a staff account", "user", "4")
        self.check("POST", "/auth/users/4/sign-out", "Signed a staff member out everywhere", "user", "4")
        self.check("POST", "/auth/sign-out-everywhere", "Signed out everywhere", "user")
        self.check("POST", "/auth/2fa/setup", "Started setting up two-step sign-in", "user")
        self.check("POST", "/auth/pin/setup", "Changed their PIN", "user")
        self.check("PUT", "/business/", "Changed the company details", "company details")
        self.check("POST", "/programs/3/copy", "Copied herding program", "herding program", "3")
        self.check("DELETE", "/devices/4", "Removed a phone", "phone", "4")

    def test_what_is_not_worth_logging_is_left_out(self):
        for method, path in (("GET", "/clients/"), ("GET", "/analytics/dashboard"), ("POST", "/auth/login"),
                             ("POST", "/auth/pin/verify"), ("GET", "/audit"), ("OPTIONS", "/clients/")):
            self.assertIsNone(audit.describe(method, path), (method, path))

    def test_downloading_sensitive_files_is_logged(self):
        self.check("GET", "/clients/5/tax-certificate", "Downloaded tax certificate of client", "client", "5")
        self.assertIsNone(audit.describe("GET", "/clients/5/tax-certificate/info"))


class RecordTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.nico = User(name="Nico", email="nico@example.com", is_admin=True)
        self.s.add(self.nico)
        self.s.commit()

    def tearDown(self):
        self.s.close()

    def test_an_entry_remembers_who_and_what(self):
        audit.record(self.s, self.nico, "Deleted client", entity="client", entity_id=5, summary="DELETE /clients/5", via="phone")
        (row,) = self.s.exec(select(AuditEntry)).all()
        self.assertEqual((row.user_id, row.user_name, row.action, row.entity, row.entity_id, row.via, row.result),
                         (self.nico.id, "Nico", "Deleted client", "client", "5", "phone", "ok"))

    def test_an_entry_can_be_for_nobody_signed_in(self):
        audit.record(self.s, None, "Failed sign-in", summary="nobody@example.com", result="failed")
        row = self.s.exec(select(AuditEntry)).one()
        self.assertEqual((row.user_id, row.user_name, row.result), (None, None, "failed"))

    def test_old_entries_are_pruned_and_the_log_is_capped(self):
        for days in (400, 10, 1):
            self.s.add(AuditEntry(at=datetime.utcnow() - timedelta(days=days), action=f"{days} days ago"))
        self.s.commit()
        audit.prune(self.s, keep_days=365, max_rows=100)
        self.assertEqual(sorted(r.action for r in self.s.exec(select(AuditEntry)).all()), ["1 days ago", "10 days ago"])
        for i in range(10):
            self.s.add(AuditEntry(action=f"entry {i}"))
        self.s.commit()
        audit.prune(self.s, keep_days=365, max_rows=5)
        self.assertEqual(len(self.s.exec(select(AuditEntry)).all()), 5)


class ReadingTheLogTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.nico = User(name="Nico", email="nico@example.com", is_admin=True)
        self.koos = User(name="Koos", email="koos@example.com")
        self.s.add_all([self.nico, self.koos])
        self.s.commit()
        audit.record(self.s, self.nico, "Deleted client", "client", 1)
        audit.record(self.s, self.koos, "Added invoice", "invoice")
        audit.record(self.s, self.koos, "Changed product", "product", 3)

    def tearDown(self):
        self.s.close()

    def test_newest_first_with_a_total(self):
        out = audit_api.read_audit(limit=2, offset=0, q=None, user_id=None, _=self.nico, session=self.s)
        self.assertEqual(out["total"], 3)
        self.assertEqual([i["action"] for i in out["items"]], ["Changed product", "Added invoice"])
        again = audit_api.read_audit(limit=2, offset=2, q=None, user_id=None, _=self.nico, session=self.s)
        self.assertEqual([i["action"] for i in again["items"]], ["Deleted client"])

    def test_filter_by_person_and_by_words(self):
        out = audit_api.read_audit(limit=50, offset=0, q=None, user_id=self.koos.id, _=self.nico, session=self.s)
        self.assertEqual(out["total"], 2)
        out = audit_api.read_audit(limit=50, offset=0, q="invoice", user_id=None, _=self.nico, session=self.s)
        self.assertEqual([i["action"] for i in out["items"]], ["Added invoice"])


def _app(engine):
    def session_override():
        with Session(engine) as s:
            yield s

    app = FastAPI()

    @app.post("/clients/")
    def add_client():
        return {"id": 1}

    @app.delete("/clients/{client_id}")
    def delete_client(client_id: int):
        if client_id == 9:
            raise HTTPException(status_code=409, detail="has invoices")
        if client_id == 8:
            raise HTTPException(status_code=422, detail="bad")
        return {"ok": True}

    @app.get("/clients/")
    def list_clients():
        return []

    app.dependency_overrides[get_session] = session_override
    return audit.AuditMiddleware(app, session_factory=lambda: Session(engine))


class MiddlewareTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as s:
            self.nico = User(name="Nico", email="nico@example.com", is_admin=True)
            s.add(self.nico)
            s.commit()
            s.refresh(self.nico)
            self.token = create_access_token(self.nico.id, 0)
        self.client = Client(_app(self.engine))
        self.auth = {"Authorization": f"Bearer {self.token}"}

    def rows(self):
        with Session(self.engine) as s:
            return s.exec(select(AuditEntry)).all()

    def test_a_change_is_logged_with_who_made_it(self):
        self.assertEqual(self.client.request("POST", "/clients/", headers=self.auth).status_code, 200)
        (row,) = self.rows()
        self.assertEqual((row.user_name, row.action, row.result), ("Nico", "Added client", "ok"))

    def test_reading_is_not_logged(self):
        self.client.get("/clients/", headers=self.auth)
        self.assertEqual(self.rows(), [])

    def test_a_refused_delete_is_logged_as_refused_but_a_validation_error_is_not(self):
        self.client.request("DELETE", "/clients/9", headers=self.auth)
        self.client.request("DELETE", "/clients/8", headers=self.auth)
        (row,) = self.rows()
        self.assertEqual((row.action, row.entity_id, row.result), ("Deleted client", "9", "refused"))

    def test_no_sign_in_means_no_entry_and_no_crash(self):
        self.assertEqual(self.client.request("POST", "/clients/").status_code, 200)
        self.assertEqual(self.client.request("POST", "/clients/", headers={"Authorization": "Bearer junk"}).status_code, 200)
        self.assertEqual(self.rows(), [])  # an anonymous change isn't something this app can do anyway

    def test_phone_requests_are_marked(self):
        class Marked:
            def __init__(self, app):
                self.app = app

            async def __call__(self, scope, receive, send):
                scope.setdefault("state", {})["via_lan"] = True
                return await self.app(scope, receive, send)

        client = Client(Marked(_app(self.engine)))
        client.request("POST", "/clients/", headers=self.auth)
        self.assertEqual(self.rows()[0].via, "phone")


class SignInEventsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.s.add(User(name="Nico", email="nico@example.com", password_hash=hash_secret("Windpomp-Kraal-2026")))
        self.s.commit()
        auth.THROTTLE.clear()

    def tearDown(self):
        self.s.close()

    def login(self, password, email="nico@example.com"):
        return auth.login(auth.LoginRequest(email=email, password=password), session=self.s)

    def actions(self):
        return [r.action for r in self.s.exec(select(AuditEntry).order_by(AuditEntry.id)).all()]

    def test_sign_ins_failures_and_locks_are_logged_without_passwords(self):
        self.login("Windpomp-Kraal-2026")
        for _ in range(5):
            with self.assertRaises(HTTPException):
                self.login("wrong-password-here")
        self.assertEqual(self.actions(), ["Signed in"] + ["Failed sign-in"] * 4 + ["Account locked"])
        for row in self.s.exec(select(AuditEntry)).all():
            self.assertNotIn("wrong-password-here", f"{row.summary} {row.action}")

    def test_a_try_on_an_email_that_is_not_an_account_is_logged_too(self):
        with self.assertRaises(HTTPException):
            self.login("whatever-password", "nobody@example.com")
        (row,) = self.s.exec(select(AuditEntry)).all()
        self.assertEqual((row.action, row.user_id, row.summary), ("Failed sign-in", None, "nobody@example.com"))


if __name__ == "__main__":
    unittest.main()
