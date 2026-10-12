"""Two-step (authenticator) secrets are stored encrypted in the database, with a key Windows protects (DPAPI): a copy of
the database file alone no longer gives anyone the codes. Recovery codes still work if the key is unreadable (e.g. the
data was restored onto another PC)."""
import os
import shutil
import tempfile
import time
import unittest
from unittest import mock

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from app.api import auth
from app.core import field_crypto, totp
from app.core.security import hash_secret
from app.models.user import User

GOOD = "Windpomp-Kraal-2026"


class FieldCryptoCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        patcher = mock.patch.object(field_crypto, "key_file", lambda: os.path.join(self.dir, "field.key"))
        patcher.start()
        self.addCleanup(patcher.stop)
        field_crypto.forget_cached_key()
        self.addCleanup(field_crypto.forget_cached_key)
        self.addCleanup(shutil.rmtree, self.dir, True)


class FieldCryptoTests(FieldCryptoCase):
    def test_round_trip_and_the_stored_form_is_not_the_text(self):
        stored = field_crypto.encrypt("JBSWY3DPEHPK3PXP")
        self.assertTrue(stored.startswith("enc1:"))
        self.assertNotIn("JBSWY3DPEHPK3PXP", stored)
        self.assertEqual(field_crypto.decrypt(stored), "JBSWY3DPEHPK3PXP")

    def test_each_encryption_is_different(self):
        self.assertNotEqual(field_crypto.encrypt("same"), field_crypto.encrypt("same"))

    def test_a_value_from_before_encryption_reads_as_it_is(self):
        self.assertEqual(field_crypto.decrypt("PLAINOLDSECRET"), "PLAINOLDSECRET")
        self.assertIsNone(field_crypto.decrypt(None))

    def test_the_key_file_never_holds_the_raw_key(self):
        field_crypto.encrypt("x")
        with open(field_crypto.key_file(), "rb") as f:
            self.assertGreater(len(f.read()), 32)  # protected (DPAPI) or at least wrapped, never 32 bare bytes

    def test_with_another_key_it_cannot_be_read(self):
        stored = field_crypto.encrypt("secret")
        os.remove(field_crypto.key_file())
        field_crypto.forget_cached_key()
        with self.assertRaises(field_crypto.Unreadable):
            field_crypto.decrypt(stored)

    def test_altered_data_is_refused(self):
        stored = field_crypto.encrypt("secret")
        broken = stored[:-4] + ("AAAA" if not stored.endswith("AAAA") else "BBBB")
        with self.assertRaises(field_crypto.Unreadable):
            field_crypto.decrypt(broken)


class TwoStepSecretAtRestTests(FieldCryptoCase):
    def setUp(self):
        super().setUp()
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.user = User(name="Nico", email="nico@example.com", password_hash=hash_secret(GOOD), is_admin=True)
        self.s.add(self.user)
        self.s.commit()
        self.addCleanup(self.s.close)
        self.addCleanup(auth.THROTTLE.clear)

    def enable(self):
        info = auth.two_step_setup(user=self.user, session=self.s)
        out = auth.two_step_enable(auth.TwoStepCode(code=totp.code_at(info["secret"], time.time())), user=self.user, session=self.s)
        return info["secret"], out["recovery_codes"]

    def login(self, code):
        return auth.login(auth.LoginRequest(email="nico@example.com", password=GOOD, code=code), session=self.s)

    def test_the_database_never_holds_the_secret_readable(self):
        secret, _ = self.enable()
        self.s.refresh(self.user)
        self.assertNotIn(secret, self.user.totp_secret)
        self.assertTrue(self.user.totp_secret.startswith("enc1:"))

    def test_sign_in_with_the_app_code_still_works(self):
        secret, _ = self.enable()
        self.assertTrue(self.login(totp.code_at(secret, time.time() + 30)).access_token)

    def test_older_plain_secrets_are_encrypted_once_and_still_work(self):
        secret = totp.new_secret()
        self.user.totp_secret, self.user.totp_enabled = secret, True
        self.s.add(self.user)
        self.s.commit()
        self.assertEqual(field_crypto.encrypt_plain_totp_secrets(self.s), 1)
        self.s.refresh(self.user)
        self.assertTrue(self.user.totp_secret.startswith("enc1:"))
        self.assertEqual(field_crypto.encrypt_plain_totp_secrets(self.s), 0)  # nothing left to do
        self.assertTrue(self.login(totp.code_at(secret, time.time())).access_token)

    def test_on_another_pc_the_app_code_cannot_work_but_a_recovery_code_still_does(self):
        secret, codes = self.enable()
        os.remove(field_crypto.key_file())  # as if the database were restored onto another computer
        field_crypto.forget_cached_key()
        with self.assertRaises(HTTPException):
            self.login(totp.code_at(secret, time.time() + 30))
        self.assertTrue(self.login(codes[0]).access_token)


if __name__ == "__main__":
    unittest.main()
