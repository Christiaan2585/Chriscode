"""Setting up "Sign in with Google" from Settings: an admin pastes the Client ID and secret; the secret is stored encrypted and
never sent back, and sign-in turns on without restarting the app."""
import json
import os
import shutil
import tempfile
import unittest
from unittest import mock

from fastapi import HTTPException

from app.api import auth
from app.core import field_crypto, google_oauth
from app.models.user import User

# built from parts so no real-looking Google key is written out in the repository
CLIENT_ID = ".".join(["123456789012-abcdefghijklmnop", "apps", "googleusercontent", "com"])
SECRET = "-".join(["GOCSPX", "abcdefghijklmnopqrstuvwxyz12"])


class GoogleConfigCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        for target, value in ((google_oauth, "_CONFIG_PATH"),):
            patcher = mock.patch.object(target, value, os.path.join(self.dir, "google_oauth.json"))
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch.object(field_crypto, "key_file", lambda: os.path.join(self.dir, "field.key"))
        patcher.start()
        self.addCleanup(patcher.stop)
        field_crypto.forget_cached_key()
        self.addCleanup(field_crypto.forget_cached_key)


class ConfigTests(GoogleConfigCase):
    def test_nothing_is_set_up_at_first(self):
        self.assertEqual(google_oauth.summary(), {"enabled": False, "client_id": None, "has_secret": False})
        self.assertFalse(google_oauth.is_google_login_enabled())

    def test_saving_turns_it_on_at_once_and_the_secret_is_encrypted_on_disk(self):
        google_oauth.save_config(f"  {CLIENT_ID} ", f" {SECRET}\n")
        self.assertTrue(google_oauth.is_google_login_enabled())
        self.assertEqual(google_oauth.get_google_client_id(), CLIENT_ID)
        self.assertEqual(google_oauth.summary(), {"enabled": True, "client_id": CLIENT_ID, "has_secret": True})
        with open(google_oauth._CONFIG_PATH, encoding="utf-8") as f:
            raw = f.read()
        self.assertNotIn(SECRET, raw)
        self.assertEqual(json.loads(raw)["client_id"], CLIENT_ID)
        self.assertEqual(google_oauth._read_config()["client_secret"], SECRET)

    def test_a_file_written_by_hand_in_plain_text_still_works(self):
        with open(google_oauth._CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump({"client_id": CLIENT_ID, "client_secret": SECRET}, f)
        self.assertTrue(google_oauth.is_google_login_enabled())

    def test_clearing_turns_it_off(self):
        google_oauth.save_config(CLIENT_ID, SECRET)
        google_oauth.clear_config()
        self.assertFalse(google_oauth.is_google_login_enabled())
        google_oauth.clear_config()  # nothing to clear is fine

    def test_a_secret_that_cannot_be_read_here_counts_as_not_set_up(self):
        google_oauth.save_config(CLIENT_ID, SECRET)
        os.remove(field_crypto.key_file())
        field_crypto.forget_cached_key()
        self.assertFalse(google_oauth.is_google_login_enabled())

    def test_bad_values_are_refused_with_a_reason(self):
        for client_id in ("", "not-an-id", "123-abc.example.com", CLIENT_ID + " extra", "<script>.apps.googleusercontent.com"):
            with self.assertRaises(ValueError, msg=client_id):
                google_oauth.save_config(client_id, SECRET)
        for secret in ("", "short", "has a space in it 12345", "x" * 300, "line\nbreak123456"):
            with self.assertRaises(ValueError, msg=secret):
                google_oauth.save_config(CLIENT_ID, secret)
        self.assertFalse(os.path.exists(google_oauth._CONFIG_PATH))


class FriendlyErrorTests(unittest.TestCase):
    def test_googles_wording_becomes_advice(self):
        cases = {
            'Google rejected the sign-in request: {"error": "invalid_client"}': "Client ID or secret",
            'Google rejected the sign-in request: {"error": "invalid_grant"}': "try again",
            'Google rejected the sign-in request: {"error": "redirect_uri_mismatch"}': "Desktop app",
            "Google sign-in is not configured on this app yet": "isn't set up yet",
            "This Google account's email is not verified": "isn't verified",
            "Google sign-in failed a security check (nonce mismatch) - please try again": "safety check",
            "something unexpected": "email and password",
        }
        for raw, expected in cases.items():
            self.assertIn(expected, google_oauth.friendly_error(raw), raw)

    def test_the_callback_shows_the_friendly_text_not_googles(self):
        body = auth.GoogleCallbackRequest(code="c", code_verifier="v" * 43, redirect_uri="http://127.0.0.1:1/cb", nonce="n")
        with mock.patch.object(auth, "exchange_code_for_profile", side_effect=RuntimeError('Google rejected the sign-in request: {"error":"invalid_client"}')):
            with self.assertRaises(HTTPException) as ctx:
                auth.google_callback(body, request=None, session=None)
        self.assertNotIn("invalid_client", ctx.exception.detail)
        self.assertIn("Client ID or secret", ctx.exception.detail)


class RouteTests(GoogleConfigCase):
    admin = User(id=1, name="Boss", email="b@example.com", is_admin=True)

    def test_the_summary_never_contains_the_secret(self):
        auth.save_google_config(auth.GoogleConfigIn(client_id=CLIENT_ID, client_secret=SECRET), request=None, _=self.admin)
        out = auth.read_google_config(_=self.admin)
        self.assertEqual(out, {"enabled": True, "client_id": CLIENT_ID, "has_secret": True})
        self.assertNotIn(SECRET, json.dumps(out))

    def test_a_bad_value_is_a_422_with_the_reason(self):
        with self.assertRaises(HTTPException) as ctx:
            auth.save_google_config(auth.GoogleConfigIn(client_id="nope", client_secret=SECRET), request=None, _=self.admin)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Client ID", ctx.exception.detail)

    def test_it_cannot_be_changed_from_a_phone(self):
        request = mock.Mock()
        request.state.via_lan = True
        with self.assertRaises(HTTPException) as ctx:
            auth.save_google_config(auth.GoogleConfigIn(client_id=CLIENT_ID, client_secret=SECRET), request=request, _=self.admin)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_removing_it_turns_google_sign_in_off(self):
        auth.save_google_config(auth.GoogleConfigIn(client_id=CLIENT_ID, client_secret=SECRET), request=None, _=self.admin)
        auth.delete_google_config(request=None, _=self.admin)
        self.assertFalse(google_oauth.is_google_login_enabled())

    def test_the_routes_need_an_admin(self):
        from app.core.security import require_admin
        for name in ("read_google_config", "save_google_config", "delete_google_config"):
            route = next(r for r in auth.router.routes if getattr(r, "endpoint", None) is getattr(auth, name))
            self.assertTrue(any(d.call is require_admin for d in route.dependant.dependencies), name)


if __name__ == "__main__":
    unittest.main()
