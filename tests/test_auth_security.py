"""Sign-in hardening: password rules, 5 tries then a lock that grows, changing a
password, signing out everywhere, and two-step sign-in (authenticator app)."""
import time
import unittest
from datetime import datetime, timedelta
from unittest import mock

import jwt
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import auth
from app.core import password_policy, security, totp
from app.core.security import hash_secret
from app.models.remember_token import RememberToken
from app.models.user import RecoveryCode, User

GOOD = "Windpomp-Kraal-2026"


class PasswordPolicyTests(unittest.TestCase):
    def test_a_good_password_passes(self):
        self.assertEqual(password_policy.problems(GOOD, "nico@example.com", "Nico de Waal"), [])

    def test_too_short(self):
        self.assertTrue(password_policy.problems("Short1!x"))

    def test_too_long_is_refused_too(self):
        self.assertTrue(password_policy.problems("a1" * 70))

    def test_the_obvious_ones_are_refused(self):
        for bad in ("password123", "Password123", "1234567890", "qwertyuiop", "letmein123", "welcome123"):
            self.assertTrue(password_policy.problems(bad), bad)

    def test_the_same_character_or_a_run_is_refused(self):
        for bad in ("aaaaaaaaaaaa", "abcdefghijkl", "mnopqrstuvwx"):
            self.assertTrue(password_policy.problems(bad), bad)

    def test_it_may_not_contain_the_email_or_the_name(self):
        self.assertTrue(password_policy.problems("nico.dewaal-2026", "nico.dewaal@example.com", "Nico"))
        self.assertTrue(password_policy.problems("xx-Garstland-Farms-9", "a@example.com", "Garstland Farms"))

    def test_require_raises_a_422_that_says_what_is_wrong(self):
        with self.assertRaises(HTTPException) as ctx:
            password_policy.require("short", "a@example.com", "A")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("10", ctx.exception.detail)


class AuthCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.user = User(name="Nico", email="nico@example.com", password_hash=hash_secret(GOOD), is_admin=True)
        self.other = User(name="Koos", email="koos@example.com", password_hash=hash_secret("Another-Good-One-1"))
        self.s.add_all([self.user, self.other])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()
        auth.THROTTLE.clear()

    def login(self, password=GOOD, email="nico@example.com", code=None):
        return auth.login(auth.LoginRequest(email=email, password=password, code=code), session=self.s)

    def fail(self, password="wrong", email="nico@example.com", code=None):
        with self.assertRaises(HTTPException) as ctx:
            self.login(password, email, code)
        return ctx.exception


class SetupAndAddUserTests(AuthCase):
    def test_a_weak_password_is_refused_when_adding_staff(self):
        with self.assertRaises(HTTPException) as ctx:
            auth.add_user(auth.AddUserRequest(name="Piet", email="piet@example.com", password="password123"),
                          _=self.user, session=self.s)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_a_good_one_is_accepted(self):
        out = auth.add_user(auth.AddUserRequest(name="Piet", email="piet@example.com", password=GOOD + "x"), _=self.user, session=self.s)
        self.assertEqual(out.email, "piet@example.com")

    def test_the_first_account_needs_a_good_password_too(self):
        empty = Session(create_engine("sqlite://"))
        SQLModel.metadata.create_all(empty.get_bind())
        with self.assertRaises(HTTPException) as ctx:
            auth.setup_first_account(auth.SetupRequest(name="Nico", email="nico@example.com", password="12345678"), session=empty)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertTrue(auth.setup_first_account(auth.SetupRequest(name="Nico", email="nico@example.com", password=GOOD), session=empty).access_token)


class FiveTriesTests(AuthCase):
    def test_each_wrong_try_says_how_many_are_left(self):
        left = [self.fail().detail for _ in range(auth.MAX_LOGIN_ATTEMPTS)]
        self.assertIn("4 tries left", left[0])
        self.assertIn("1 try left", left[3])
        self.assertIn("locked", left[4])

    def test_five_wrong_tries_lock_the_account_even_for_the_right_password(self):
        for _ in range(5):
            self.fail()
        err = self.fail(GOOD)
        self.assertEqual(err.status_code, 429)

    def test_the_lock_grows_each_time_it_is_hit(self):
        durations = []
        for round_ in range(5):
            for _ in range(5):
                self.fail()
            self.s.refresh(self.user)
            durations.append(self.user.login_locked_until - datetime.utcnow())
            self.user.login_locked_until = None  # time passes
            self.s.add(self.user)
            self.s.commit()
        mins = [d.total_seconds() / 60 for d in durations]
        self.assertAlmostEqual(mins[0], 15, delta=1)
        self.assertAlmostEqual(mins[1], 60, delta=1)
        self.assertAlmostEqual(mins[2], 240, delta=1)
        self.assertAlmostEqual(mins[3], 1440, delta=1)
        self.assertAlmostEqual(mins[4], 1440, delta=1)  # stays at a day

    def test_a_good_sign_in_clears_the_strikes(self):
        for _ in range(5):
            self.fail()
        self.user.login_locked_until = None
        self.s.add(self.user)
        self.s.commit()
        self.login()
        self.s.refresh(self.user)
        self.assertEqual((self.user.failed_login_attempts, self.user.lockout_count), (0, 0))

    def test_an_unknown_email_is_counted_and_locked_the_same_way(self):
        details = [self.fail(email="nobody@example.com").detail for _ in range(5)]
        self.assertIn("4 tries left", details[0])
        self.assertEqual(self.fail(email="nobody@example.com").status_code, 429)

    def test_an_admin_can_unlock_an_account(self):
        for _ in range(5):
            self.fail()
        auth.unlock_user(self.user.id, admin=self.other, session=self.s)
        self.assertTrue(self.login().access_token)


class ChangePasswordTests(AuthCase):
    def change(self, current=GOOD, new="Brand-New-Kraal-77", user=None):
        return auth.change_my_password(auth.PasswordChange(current_password=current, new_password=new), user=user or self.user, session=self.s)

    def test_it_works_and_the_old_password_stops_working(self):
        self.change()
        self.assertTrue(self.login("Brand-New-Kraal-77").access_token)
        self.assertEqual(self.fail(GOOD).status_code, 401)

    def test_a_weak_new_password_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            self.change(new="password123")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_the_current_password_must_be_right_and_wrong_tries_count_toward_the_lock(self):
        for _ in range(4):
            with self.assertRaises(HTTPException) as ctx:
                self.change(current="wrong")
            self.assertEqual(ctx.exception.status_code, 401)
        with self.assertRaises(HTTPException):
            self.change(current="wrong")
        with self.assertRaises(HTTPException) as ctx:
            self.change(current=GOOD)  # locked now, even for the right one
        self.assertEqual(ctx.exception.status_code, 429)

    def test_every_other_session_and_device_is_signed_out(self):
        old = auth._issue_auth_result(self.user, self.s)
        before = security.decode_access_token(old.access_token)
        self.assertEqual(before[0], self.user.id)
        result = self.change()
        with self.assertRaises(HTTPException):  # the old access token no longer opens anything
            security.get_current_user(credentials=mock.Mock(credentials=old.access_token), session=self.s)
        self.assertEqual(len(self.s.exec(select(RememberToken).where(RememberToken.user_id == self.user.id)).all()), 1)
        self.assertEqual(security.get_current_user(credentials=mock.Mock(credentials=result.access_token), session=self.s).id, self.user.id)

    def test_changing_the_password_clears_a_forced_change(self):
        self.user.must_change_password = True
        self.s.add(self.user)
        self.s.commit()
        self.change()
        self.s.refresh(self.user)
        self.assertFalse(self.user.must_change_password)


class SignOutEverywhereTests(AuthCase):
    def test_tokens_and_remembered_devices_stop_working(self):
        result = auth._issue_auth_result(self.user, self.s)
        auth.sign_out_everywhere(user=self.user, session=self.s)
        with self.assertRaises(HTTPException):
            security.get_current_user(credentials=mock.Mock(credentials=result.access_token), session=self.s)
        self.assertEqual(self.s.exec(select(RememberToken)).all(), [])
        self.assertTrue(self.login().access_token)  # signing in again works

    def test_an_admin_can_sign_a_user_out_and_reset_their_password(self):
        result = auth._issue_auth_result(self.other, self.s)
        auth.admin_reset_password(self.other.id, auth.AdminPasswordReset(new_password="Temp-Kraal-Pass-12"), admin=self.user, session=self.s)
        with self.assertRaises(HTTPException):
            security.get_current_user(credentials=mock.Mock(credentials=result.access_token), session=self.s)
        self.s.refresh(self.other)
        self.assertTrue(self.other.must_change_password)
        self.assertTrue(self.login("Temp-Kraal-Pass-12", "koos@example.com").user.must_change_password)

    def test_an_admin_cannot_reset_their_own_password_or_two_step_without_proof(self):
        for call in (lambda: auth.admin_reset_password(self.user.id, auth.AdminPasswordReset(new_password="Temp-Kraal-Pass-12"), admin=self.user, session=self.s),
                     lambda: auth.admin_reset_two_step(self.user.id, admin=self.user, session=self.s)):
            with self.assertRaises(HTTPException) as ctx:
                call()
            self.assertEqual(ctx.exception.status_code, 400)

    def test_google_sign_in_does_not_skip_two_step_or_the_lock(self):
        profile = {"sub": "g-1", "email": "koos@example.com", "name": "Koos"}
        request = auth.GoogleCallbackRequest(code="c", code_verifier="v", redirect_uri="http://127.0.0.1:1/", nonce="n")
        with mock.patch.object(auth, "exchange_code_for_profile", return_value=profile):
            self.assertTrue(auth.google_callback(request, session=self.s).access_token)  # plain account: fine
            self.other.login_locked_until = datetime.utcnow() + timedelta(minutes=5)
            with self.assertRaises(HTTPException) as locked:
                auth.google_callback(request, session=self.s)
            self.assertEqual(locked.exception.status_code, 429)
            self.other.login_locked_until, self.other.totp_enabled = None, True
            with self.assertRaises(HTTPException) as two_step:
                auth.google_callback(request, session=self.s)
            self.assertEqual(two_step.exception.status_code, 403)

    def test_a_reset_password_must_be_a_good_one(self):
        with self.assertRaises(HTTPException):
            auth.admin_reset_password(self.other.id, auth.AdminPasswordReset(new_password="password123"), admin=self.user, session=self.s)


class TokenLifetimeTests(AuthCase):
    def test_a_phone_session_is_shorter_than_the_pcs(self):
        pc = jwt.decode(security.create_access_token(1, 0), options={"verify_signature": False})
        phone = jwt.decode(security.create_access_token(1, 0, phone=True), options={"verify_signature": False})
        self.assertLess(phone["exp"] - phone["iat"], pc["exp"] - pc["iat"])
        self.assertLess(security.PHONE_REMEMBER_LIFETIME, security.REMEMBER_TOKEN_LIFETIME)


class TotpTests(unittest.TestCase):
    SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # RFC 6238's "12345678901234567890"

    def test_matches_the_rfc_6238_test_vector(self):
        self.assertEqual(totp.code_at(self.SECRET, 59), "287082")
        self.assertEqual(totp.code_at(self.SECRET, 1111111109), "081804")
        self.assertEqual(totp.code_at(self.SECRET, 2000000000), "279037")

    def test_a_code_from_the_neighbouring_30_seconds_is_accepted_but_not_older(self):
        now = 1_700_000_000
        good = totp.code_at(self.SECRET, now - 30)
        self.assertIsNotNone(totp.verify(self.SECRET, good, now=now))
        self.assertIsNone(totp.verify(self.SECRET, totp.code_at(self.SECRET, now - 90), now=now))

    def test_wrong_input_never_matches(self):
        for bad in ("", "abcdef", "12345", "1234567", None):
            self.assertIsNone(totp.verify(self.SECRET, bad, now=1_700_000_000))

    def test_a_new_secret_is_random_base32_and_the_link_names_the_app(self):
        a, b = totp.new_secret(), totp.new_secret()
        self.assertNotEqual(a, b)
        self.assertRegex(a, r"^[A-Z2-7]{32}$")
        uri = totp.otpauth_uri(a, "nico@example.com")
        self.assertTrue(uri.startswith("otpauth://totp/"))
        self.assertIn("Sandveld", uri)


class TwoStepTests(AuthCase):
    def enable(self):
        info = auth.two_step_setup(user=self.user, session=self.s)
        code = totp.code_at(info["secret"], time.time())
        out = auth.two_step_enable(auth.TwoStepCode(code=code), user=self.user, session=self.s)
        return info["secret"], out["recovery_codes"]

    def now_code(self, secret, offset=0):
        return totp.code_at(secret, time.time() + offset)

    def test_setup_then_enable_gives_eight_recovery_codes(self):
        secret, codes = self.enable()
        self.assertEqual(len(codes), 8)
        self.assertEqual(len(set(codes)), 8)
        self.s.refresh(self.user)
        self.assertTrue(self.user.totp_enabled)
        self.assertEqual(len(self.s.exec(select(RecoveryCode)).all()), 8)
        stored = self.s.exec(select(RecoveryCode)).first()
        self.assertNotIn(codes[0], stored.code_hash)  # only hashes are kept

    def test_enabling_needs_a_correct_code(self):
        auth.two_step_setup(user=self.user, session=self.s)
        with self.assertRaises(HTTPException) as ctx:
            auth.two_step_enable(auth.TwoStepCode(code="000000"), user=self.user, session=self.s)
        self.assertEqual(ctx.exception.status_code, 400)
        self.s.refresh(self.user)
        self.assertFalse(self.user.totp_enabled)

    def test_sign_in_then_needs_the_code(self):
        secret, _ = self.enable()
        err = self.fail(GOOD)
        self.assertEqual(err.status_code, 401)
        self.assertEqual(err.detail["code"], "two_step_required")
        # (enabling used this 30-second step's code; the next one is what the app shows next)
        self.assertTrue(self.login(GOOD, code=self.now_code(secret, 30)).access_token)

    def test_asking_for_the_code_is_not_a_wrong_try(self):
        secret, _ = self.enable()
        for _ in range(6):
            self.fail(GOOD)  # password right, code missing - only asks for the code
        self.assertTrue(self.login(GOOD, code=self.now_code(secret, 30)).access_token)

    def test_wrong_codes_count_toward_the_five_tries(self):
        secret, _ = self.enable()
        for _ in range(5):
            self.fail(GOOD, code="000001")
        self.assertEqual(self.fail(GOOD, code=self.now_code(secret, 30)).status_code, 429)

    def test_a_code_cannot_be_used_twice(self):
        secret, _ = self.enable()
        code = self.now_code(secret, 30)
        self.login(GOOD, code=code)
        err = self.fail(GOOD, code=code)
        self.assertEqual(err.status_code, 401)

    def test_a_recovery_code_works_once(self):
        _, codes = self.enable()
        self.assertTrue(self.login(GOOD, code=codes[0]).access_token)
        self.assertEqual(self.fail(GOOD, code=codes[0]).status_code, 401)
        self.assertTrue(self.login(GOOD, code=codes[1].lower()).access_token)  # case and dashes don't matter

    def test_turning_it_off_needs_the_password_and_a_code(self):
        secret, _ = self.enable()
        with self.assertRaises(HTTPException):
            auth.two_step_disable(auth.TwoStepDisable(password="wrong", code=self.now_code(secret, 30)), user=self.user, session=self.s)
        auth.two_step_disable(auth.TwoStepDisable(password=GOOD, code=self.now_code(secret, 30)), user=self.user, session=self.s)
        self.s.refresh(self.user)
        self.assertFalse(self.user.totp_enabled)
        self.assertEqual(self.s.exec(select(RecoveryCode)).all(), [])
        self.assertTrue(self.login().access_token)

    def test_the_account_says_whether_two_step_is_on(self):
        self.assertFalse(auth.UserOut.from_user(self.user, self.s).two_step_enabled)
        self.enable()
        self.s.refresh(self.user)
        self.assertTrue(auth.UserOut.from_user(self.user, self.s).two_step_enabled)


if __name__ == "__main__":
    unittest.main()
