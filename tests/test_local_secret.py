"""The per-launch secret between the desktop window and its backend."""
import unittest

from fastapi import FastAPI

from app.core.local_secret import LocalSecretGuard
from tests.test_lan import Client

SECRET = "s3cret-for-this-launch-only"


def _app():
    app = FastAPI()

    @app.get("/clients/")
    def clients():
        return []

    @app.get("/")
    def root():
        return {"ok": True}

    @app.get("/version")
    def version():
        return {"version": "x"}

    @app.get("/local-check")
    def check():
        return {"ok": True}

    return app


class Marked:
    """What lan.DeviceGuard does for the phone listener."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        scope.setdefault("state", {})["via_lan"] = True
        return await self.app(scope, receive, send)


class LocalSecretTests(unittest.TestCase):
    def setUp(self):
        self.guarded = Client(LocalSecretGuard(_app(), secret=SECRET))

    def test_without_the_secret_the_api_is_closed(self):
        self.assertEqual(self.guarded.get("/clients/").status_code, 403)

    def test_a_wrong_secret_is_closed_too(self):
        for bad in ("", "nope", SECRET + "x", SECRET[:-1]):
            self.assertEqual(self.guarded.get("/clients/", headers={"X-Local-Secret": bad}).status_code, 403, bad)

    def test_with_the_secret_it_opens(self):
        self.assertEqual(self.guarded.get("/clients/", headers={"X-Local-Secret": SECRET}).status_code, 200)

    def test_the_launcher_can_still_see_the_backend_is_up(self):
        self.assertEqual(self.guarded.get("/").status_code, 200)
        self.assertEqual(self.guarded.get("/version").status_code, 200)

    def test_preflight_requests_pass(self):
        self.assertNotEqual(self.guarded.request("OPTIONS", "/clients/").status_code, 403)

    def test_phones_are_not_asked_for_it(self):
        phone = Client(Marked(LocalSecretGuard(_app(), secret=SECRET)))
        self.assertEqual(phone.get("/clients/").status_code, 200)  # the device guard in front decides about phones

    def test_with_no_secret_set_nothing_changes(self):
        for secret in ("", None):
            open_client = Client(LocalSecretGuard(_app(), secret=secret))
            self.assertEqual(open_client.get("/clients/").status_code, 200)


if __name__ == "__main__":
    unittest.main()
