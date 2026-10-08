"""Phones on the office network (Phase 1 of the Android app): the HTTPS
listener's certificate, pairing codes, the device-token guard in front of
the whole API, and the sign-in attempt limit."""
import asyncio
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest import mock

from cryptography import x509
from fastapi import Depends, FastAPI, HTTPException
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.api import auth, devices
from app.core import lan
from app.core.db import get_session
from app.core.security import hash_secret
from app.models.device import PairedDevice
from app.models.user import User


class CertificateTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def test_certificate_is_made_once_and_kept(self):
        cert1, key1, fp1 = lan.ensure_certificate(self.dir)
        cert2, key2, fp2 = lan.ensure_certificate(self.dir)
        self.assertEqual((cert1, key1, fp1), (cert2, key2, fp2))
        self.assertRegex(fp1, r"^[0-9a-f]{64}$")
        with open(cert1, "rb") as f:
            cert = x509.load_pem_x509_certificate(f.read())
        self.assertGreater(cert.not_valid_after_utc, datetime.now(cert.not_valid_after_utc.tzinfo) + timedelta(days=3000))

    def test_settings_default_off(self):
        self.assertEqual(lan.load_settings(self.dir), {"enabled": False, "port": lan.DEFAULT_PORT})
        lan.save_settings(self.dir, {"enabled": True, "port": 8443})
        self.assertTrue(lan.load_settings(self.dir)["enabled"])


class PairingCodeTests(unittest.TestCase):
    def setUp(self):
        self.codes = lan.PairingCodes()

    def test_code_works_once(self):
        code = self.codes.create()["code"]
        self.assertTrue(self.codes.consume(code))
        self.assertFalse(self.codes.consume(code))

    def test_code_ignores_case_spaces_and_dash(self):
        code = self.codes.create()["code"]
        self.assertTrue(self.codes.consume(" " + code.replace("-", "").lower() + " "))

    def test_expired_code_refused(self):
        code = self.codes.create()["code"]
        with mock.patch.object(lan, "_now", return_value=datetime.utcnow() + lan.PAIRING_CODE_LIFETIME + timedelta(seconds=1)):
            self.assertFalse(self.codes.consume(code))

    def test_guessing_kills_the_code(self):
        code = self.codes.create()["code"]
        for _ in range(lan.MAX_PAIRING_ATTEMPTS):
            self.assertFalse(self.codes.consume("WRONG-CODE"))
        self.assertFalse(self.codes.consume(code))


class Response:
    def __init__(self, status_code, body, headers=None):
        self.status_code, self.body, self.headers = status_code, body, headers or {}

    def json(self):
        return json.loads(self.body)


class Client:
    """A minimal stand-in for Starlette's TestClient (which needs httpx):
    one ASGI request, straight into the app."""

    def __init__(self, app):
        self.app = app

    def request(self, method, path, headers=None, json_body=None):
        body = json.dumps(json_body).encode() if json_body is not None else b""
        raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
        if json_body is not None:
            raw_headers.append((b"content-type", b"application/json"))
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
                 "scheme": "https", "path": path, "raw_path": path.encode(), "query_string": b"",
                 "root_path": "", "headers": raw_headers, "client": ("192.168.1.50", 50000),
                 "server": ("192.168.1.10", 8443), "state": {}}
        sent, out = [False], {"status": None, "body": b"", "headers": {}}

        async def receive():
            if sent[0]:
                return {"type": "http.disconnect"}
            sent[0] = True
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message):
            if message["type"] == "http.response.start":
                out["status"] = message["status"]
                out["headers"] = {k.decode().lower(): v.decode() for k, v in message.get("headers", [])}
            elif message["type"] == "http.response.body":
                out["body"] += message.get("body", b"")

        asyncio.run(self.app(scope, receive, send))
        return Response(out["status"], out["body"], out["headers"])

    def get(self, path, headers=None):
        return self.request("GET", path, headers)

    def post(self, path, json=None, headers=None):
        return self.request("POST", path, headers, json)


def _app_and_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    def session_override():
        with Session(engine) as s:
            yield s

    app = FastAPI()
    app.include_router(devices.router)

    @app.get("/version")
    def version():
        return {"ok": True}

    @app.get("/local-only", dependencies=[Depends(devices.require_local)])
    def local_only():
        return {"ok": True}

    app.dependency_overrides[get_session] = session_override
    return app, engine


class DeviceGuardTests(unittest.TestCase):
    def setUp(self):
        self.app, self.engine = _app_and_session()
        self.codes = lan.PairingCodes()
        patcher = mock.patch.object(devices, "PAIRING_CODES", self.codes)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.local = Client(self.app)
        self.phone = Client(lan.DeviceGuard(self.app, session_factory=lambda: Session(self.engine)))

    def pair(self, name="Nico's phone"):
        code = self.codes.create()["code"]
        return self.phone.post("/devices/pair", json={"code": code, "name": name})

    def test_pairing_gives_a_token_stored_only_as_a_hash(self):
        r = self.pair()
        self.assertEqual(r.status_code, 200)
        token = r.json()["device_token"]
        with Session(self.engine) as s:
            row = s.exec(select(PairedDevice)).one()
        self.assertEqual(row.name, "Nico's phone")
        self.assertNotEqual(row.token_hash, token)
        self.assertNotIn(token, row.token_hash)

    def test_wrong_code_refused(self):
        r = self.phone.post("/devices/pair", json={"code": "ABCD-EFGH", "name": "x"})
        self.assertEqual(r.status_code, 403)

    def test_unpaired_phone_reaches_nothing(self):
        for path in ("/version", "/local-only", "/auth/login"):
            self.assertEqual(self.phone.get(path).status_code, 401, path)

    def test_paired_phone_gets_through(self):
        token = self.pair().json()["device_token"]
        r = self.phone.get("/version", headers={"X-Device-Token": token})
        self.assertEqual(r.status_code, 200)
        with Session(self.engine) as s:
            self.assertIsNotNone(s.exec(select(PairedDevice)).one().last_seen_at)

    def test_removed_phone_is_locked_out_at_once(self):
        token = self.pair().json()["device_token"]
        with Session(self.engine) as s:
            device = s.exec(select(PairedDevice)).one()
            devices.remove_device(device.id, session=s)
        self.assertEqual(self.phone.get("/version", headers={"X-Device-Token": token}).status_code, 401)

    def test_pc_only_settings_refused_over_the_phone_link(self):
        token = self.pair().json()["device_token"]
        self.assertEqual(self.phone.get("/local-only", headers={"X-Device-Token": token}).status_code, 403)
        self.assertEqual(self.local.get("/local-only").status_code, 200)

    def test_the_pc_itself_needs_no_device_token(self):
        self.assertEqual(self.local.get("/version").status_code, 200)


class PhoneAppOriginTests(DeviceGuardTests):
    """The Android app's page lives at https://localhost, so every call it makes to the PC is cross-origin:
    without CORS answers on the phone listener the app could not even pair."""
    APP = {"Origin": "https://localhost"}

    def test_the_preflight_is_answered_without_a_token(self):
        r = self.phone.request("OPTIONS", "/devices/pair", {**self.APP, "Access-Control-Request-Method": "POST",
                                                           "Access-Control-Request-Headers": "content-type,x-device-token,authorization"})
        self.assertEqual(r.status_code, 204)
        self.assertEqual(r.headers["access-control-allow-origin"], "https://localhost")
        for header in ("x-device-token", "authorization", "content-type"):
            self.assertIn(header, r.headers["access-control-allow-headers"].lower())
        self.assertIn("DELETE", r.headers["access-control-allow-methods"])

    def test_answers_carry_the_origin_even_when_refused(self):
        self.assertEqual(self.phone.get("/version", headers=self.APP).status_code, 401)
        self.assertEqual(self.phone.get("/version", headers=self.APP).headers["access-control-allow-origin"], "https://localhost")
        token = self.pair().json()["device_token"]
        ok = self.phone.get("/version", headers={**self.APP, "X-Device-Token": token})
        self.assertEqual((ok.status_code, ok.headers["access-control-allow-origin"]), (200, "https://localhost"))
        self.assertIn("content-disposition", ok.headers["access-control-expose-headers"].lower())

    def test_other_websites_get_nothing(self):
        r = self.phone.request("OPTIONS", "/devices/pair", {"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
        self.assertNotIn("access-control-allow-origin", r.headers)
        self.assertEqual(r.status_code, 401)
        self.assertNotIn("access-control-allow-origin", self.phone.get("/version", headers={"Origin": "https://evil.example"}).headers)

    def test_the_pc_listener_does_not_trust_the_phone_origin(self):
        self.assertNotIn("access-control-allow-origin", self.local.get("/version", headers=self.APP).headers)


class LoginLimitTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.s.add(User(name="Nico", email="nico@example.com", password_hash=hash_secret("right-password")))
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def login(self, password):
        return auth.login(auth.LoginRequest(email="nico@example.com", password=password), session=self.s)

    def test_locked_after_too_many_wrong_passwords(self):
        for _ in range(auth.MAX_LOGIN_ATTEMPTS):
            with self.assertRaises(HTTPException) as ctx:
                self.login("wrong")
            self.assertEqual(ctx.exception.status_code, 401)
        with self.assertRaises(HTTPException) as ctx:
            self.login("right-password")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_lock_wears_off(self):
        for _ in range(auth.MAX_LOGIN_ATTEMPTS):
            with self.assertRaises(HTTPException):
                self.login("wrong")
        later = datetime.utcnow() + auth.LOGIN_LOCKOUT + timedelta(seconds=1)
        with mock.patch.object(auth, "_utcnow", return_value=later):
            self.assertTrue(self.login("right-password").access_token)

    def test_success_resets_the_count(self):
        for _ in range(auth.MAX_LOGIN_ATTEMPTS - 1):
            with self.assertRaises(HTTPException):
                self.login("wrong")
        self.login("right-password")
        for _ in range(auth.MAX_LOGIN_ATTEMPTS - 1):
            with self.assertRaises(HTTPException):
                self.login("wrong")
        self.assertTrue(self.login("right-password").access_token)


if __name__ == "__main__":
    unittest.main()
