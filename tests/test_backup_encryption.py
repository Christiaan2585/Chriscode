"""Backups can be locked with a passphrase, so the copy on a USB stick or in
OneDrive is unreadable to anyone who finds it."""
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

from fastapi import HTTPException

from app.api import backups as backups_api
from app.core import backup, backup_crypto

PASS = "Kraal-Windpomp-Sleutel-2026"


def make_db(path, value="original"):
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS t (v TEXT)")
    conn.execute("DELETE FROM t")
    conn.execute("INSERT INTO t VALUES (?)", (value,))
    conn.commit()
    conn.close()


def read_db(path):
    conn = sqlite3.connect(path)
    try:
        return conn.execute("SELECT v FROM t").fetchone()[0]
    finally:
        conn.close()


class CryptoTests(unittest.TestCase):
    def test_round_trip_and_nothing_readable_in_the_file(self):
        data = b"SQLite format 3\x00" + b"client: Oom Piet, phone 082 000 0000" * 50
        blob = backup_crypto.encrypt(data, PASS)
        self.assertNotIn(b"Oom Piet", blob)
        self.assertNotIn(b"SQLite format", blob)
        self.assertEqual(backup_crypto.decrypt(blob, PASS), data)

    def test_every_file_is_different(self):
        self.assertNotEqual(backup_crypto.encrypt(b"same", PASS), backup_crypto.encrypt(b"same", PASS))

    def test_the_wrong_passphrase_or_a_damaged_file_is_refused(self):
        blob = backup_crypto.encrypt(b"secret data", PASS)
        with self.assertRaises(backup_crypto.WrongPassphrase):
            backup_crypto.decrypt(blob, "not-the-passphrase-1")
        damaged = bytearray(blob)
        damaged[-5] ^= 0xFF
        with self.assertRaises(backup_crypto.WrongPassphrase):
            backup_crypto.decrypt(bytes(damaged), PASS)
        with self.assertRaises(backup_crypto.WrongPassphrase):
            backup_crypto.decrypt(b"not a backup at all", PASS)

    def test_the_passphrase_must_be_a_good_one(self):
        for bad in ("short", "password123456", "aaaaaaaaaaaaaa"):
            with self.assertRaises(ValueError):
                backup_crypto.check_passphrase(bad)
        backup_crypto.check_passphrase(PASS)

    @unittest.skipUnless(sys.platform == "win32", "Windows only")
    def test_the_saved_passphrase_is_tied_to_the_windows_account(self):
        saved = backup_crypto.protect(PASS)
        self.assertEqual(saved["scheme"], "dpapi")
        self.assertNotIn(PASS, str(saved))
        self.assertEqual(backup_crypto.unprotect(saved), PASS)


class EncryptedBackupTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.db = os.path.join(self.dir, "kyron_agri.db")
        make_db(self.db)
        self.dest = os.path.join(self.dir, "backups")
        self.now = datetime(2026, 10, 7, 12, 0, 0)

    def test_without_a_passphrase_nothing_changes(self):
        path = backup.create_backup(self.db, self.dest, now=self.now)
        self.assertTrue(path.endswith(".db"))
        self.assertEqual(read_db(path), "original")

    def test_with_one_the_file_is_encrypted_and_no_plain_copy_is_left(self):
        path = backup.create_backup(self.db, self.dest, now=self.now, passphrase=PASS)
        self.assertTrue(path.endswith(".db.enc"))
        with open(path, "rb") as f:
            self.assertNotIn(b"SQLite format", f.read())
        self.assertEqual([n for n in os.listdir(self.dest) if not n.endswith(".enc")], [])

    def test_the_list_says_which_are_encrypted_and_pruning_covers_both(self):
        backup.create_backup(self.db, self.dest, now=self.now)
        backup.create_backup(self.db, self.dest, now=self.now + timedelta(days=1), passphrase=PASS)
        backup.create_backup(self.db, self.dest, now=self.now + timedelta(days=2), passphrase=PASS)
        listed = backup.list_backups(self.dest)
        self.assertEqual([b["encrypted"] for b in listed], [True, True, False])
        backup.prune_backups(self.dest, keep=2)
        self.assertEqual(len(backup.list_backups(self.dest)), 2)

    def test_restoring_needs_the_passphrase_and_brings_the_data_back(self):
        path = backup.create_backup(self.db, self.dest, now=self.now, passphrase=PASS)
        make_db(self.db, "changed since")
        name = os.path.basename(path)
        with self.assertRaises(ValueError):
            backup.restore_backup(self.db, self.dest, name, now=self.now + timedelta(minutes=1))
        with self.assertRaises(ValueError):
            backup.restore_backup(self.db, self.dest, name, now=self.now + timedelta(minutes=1), passphrase="wrong-passphrase-1")
        self.assertEqual(read_db(self.db), "changed since")  # a failed restore changed nothing
        backup.restore_backup(self.db, self.dest, name, now=self.now + timedelta(minutes=2), passphrase=PASS)
        self.assertEqual(read_db(self.db), "original")

    def test_the_safety_copy_taken_before_a_restore_is_encrypted_too(self):
        path = backup.create_backup(self.db, self.dest, now=self.now, passphrase=PASS)
        safety = backup.restore_backup(self.db, self.dest, os.path.basename(path), now=self.now + timedelta(minutes=5), passphrase=PASS)
        self.assertTrue(safety.endswith(".db.enc"))

    def test_the_extra_copy_is_the_encrypted_file(self):
        extra = os.path.join(self.dir, "usb")
        os.makedirs(extra)
        result = backup.run_backup(self.db, self.dest, extra_folder=extra, now=self.now, passphrase=PASS)
        self.assertTrue(result["extra"].endswith(".db.enc"))
        with open(result["extra"], "rb") as f:
            self.assertNotIn(b"SQLite format", f.read())

    def test_a_plain_backup_can_still_be_restored_after_encryption_is_switched_on(self):
        path = backup.create_backup(self.db, self.dest, now=self.now)
        make_db(self.db, "changed since")
        backup.restore_backup(self.db, self.dest, os.path.basename(path), now=self.now + timedelta(minutes=1), passphrase=PASS)
        self.assertEqual(read_db(self.db), "original")

    def test_names_that_are_not_backups_are_still_refused(self):
        for bad in ("../kyron_agri-20261007-120000.db", "kyron_agri-20261007-120000.db.enc.exe", "other.enc"):
            with self.assertRaises(ValueError):
                backup.restore_backup(self.db, self.dest, bad, passphrase=PASS)


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "backup_settings.json")

    def test_the_saved_settings_never_hold_the_passphrase_in_plain_view(self):
        backup.set_passphrase(self.path, PASS)
        with open(self.path) as f:
            self.assertNotIn(PASS, f.read())
        self.assertEqual(backup.get_passphrase(self.path), PASS)
        self.assertTrue(backup.load_settings(self.path)["encrypted"])

    def test_it_survives_saving_the_other_settings(self):
        backup.set_passphrase(self.path, PASS)
        backup.save_settings(self.path, {"extra_folder": None, "keep": 10})
        self.assertEqual(backup.get_passphrase(self.path), PASS)
        self.assertEqual(backup.load_settings(self.path)["keep"], 10)

    def test_turning_it_off_forgets_it(self):
        backup.set_passphrase(self.path, PASS)
        backup.set_passphrase(self.path, None)
        self.assertIsNone(backup.get_passphrase(self.path))
        self.assertFalse(backup.load_settings(self.path)["encrypted"])

    def test_a_weak_passphrase_is_not_saved(self):
        with self.assertRaises(ValueError):
            backup.set_passphrase(self.path, "short")
        self.assertIsNone(backup.get_passphrase(self.path))


class ApiTests(unittest.TestCase):
    def test_a_weak_passphrase_is_a_422(self):
        with self.assertRaises(HTTPException) as ctx:
            backups_api.set_encryption(backups_api.EncryptionRequest(passphrase="short"))
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
