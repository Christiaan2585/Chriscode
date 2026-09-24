import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta

from app.core import backup


def _make_db(path, rows=("alpha",)):
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE client (id INTEGER PRIMARY KEY, name TEXT)")
    conn.executemany("INSERT INTO client (name) VALUES (?)", [(r,) for r in rows])
    conn.commit()
    conn.close()


def _names(path):
    conn = sqlite3.connect(path)
    try:
        return [r[0] for r in conn.execute("SELECT name FROM client ORDER BY id")]
    finally:
        conn.close()


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.db = os.path.join(self.root, "kyron_agri.db")
        _make_db(self.db, rows=("alpha", "beta"))
        self.backups = os.path.join(self.root, "backups")

    def tearDown(self):
        self.tmp.cleanup()

    def test_create_backup_is_a_readable_copy_of_the_live_db(self):
        path = backup.create_backup(self.db, self.backups, now=datetime(2026, 9, 24, 8, 30, 0))
        self.assertEqual(os.path.basename(path), "kyron_agri-20260924-083000.db")
        self.assertEqual(_names(path), ["alpha", "beta"])

    def test_create_backup_works_while_the_live_db_is_open(self):
        live = sqlite3.connect(self.db)
        live.execute("INSERT INTO client (name) VALUES ('gamma')")
        live.commit()
        try:
            path = backup.create_backup(self.db, self.backups)
        finally:
            live.close()
        self.assertEqual(_names(path), ["alpha", "beta", "gamma"])

    def test_missing_database_fails_instead_of_backing_up_an_empty_file(self):
        missing = os.path.join(self.root, "wrong-path.db")
        with self.assertRaises(FileNotFoundError):
            backup.create_backup(missing, self.backups)
        self.assertFalse(os.path.exists(missing))
        self.assertEqual(backup.list_backups(self.backups), [])

    def test_prune_keeps_newest_and_never_touches_other_files(self):
        os.makedirs(self.backups)
        for day in range(1, 6):
            backup.create_backup(self.db, self.backups, now=datetime(2026, 9, day, 12, 0, 0))
        unrelated = os.path.join(self.backups, "my-tax-return.xlsx")
        with open(unrelated, "w") as f:
            f.write("not ours")

        removed = backup.prune_backups(self.backups, keep=2)

        self.assertEqual(len(removed), 3)
        remaining = sorted(os.listdir(self.backups))
        self.assertEqual(remaining, [
            "kyron_agri-20260904-120000.db",
            "kyron_agri-20260905-120000.db",
            "my-tax-return.xlsx",
        ])

    def test_list_backups_newest_first(self):
        backup.create_backup(self.db, self.backups, now=datetime(2026, 9, 1, 12, 0, 0))
        backup.create_backup(self.db, self.backups, now=datetime(2026, 9, 3, 12, 0, 0))
        listed = backup.list_backups(self.backups)
        self.assertEqual([b["name"] for b in listed], [
            "kyron_agri-20260903-120000.db",
            "kyron_agri-20260901-120000.db",
        ])
        self.assertEqual(listed[0]["created_at"], datetime(2026, 9, 3, 12, 0, 0))
        self.assertGreater(listed[0]["size"], 0)

    def test_list_backups_of_missing_folder_is_empty(self):
        self.assertEqual(backup.list_backups(os.path.join(self.root, "nope")), [])

    def test_backup_due_after_24_hours(self):
        now = datetime(2026, 9, 24, 12, 0, 0)
        self.assertTrue(backup.is_backup_due(None, now))
        self.assertFalse(backup.is_backup_due(now - timedelta(hours=23), now))
        self.assertTrue(backup.is_backup_due(now - timedelta(hours=25), now))

    def test_run_backup_copies_into_a_subfolder_of_the_extra_folder(self):
        extra = os.path.join(self.root, "OneDrive")
        os.makedirs(extra)
        result = backup.run_backup(self.db, self.backups, extra_folder=extra, keep=30)
        self.assertTrue(os.path.isfile(result["primary"]))
        self.assertIsNone(result["extra_error"])
        self.assertEqual(os.path.dirname(result["extra"]),
                         os.path.join(extra, backup.EXTRA_SUBFOLDER))
        self.assertEqual(_names(result["extra"]), ["alpha", "beta"])

    def test_unreachable_extra_folder_does_not_stop_the_primary_backup(self):
        missing = os.path.join(self.root, "unplugged-usb-drive")
        result = backup.run_backup(self.db, self.backups, extra_folder=missing, keep=30)
        self.assertTrue(os.path.isfile(result["primary"]))
        self.assertIsNone(result["extra"])
        self.assertIn("not found", result["extra_error"])

    def test_settings_default_when_missing_and_round_trip(self):
        path = os.path.join(self.root, "backup_settings.json")
        self.assertEqual(backup.load_settings(path), {"extra_folder": None, "keep": 30})
        backup.save_settings(path, {"extra_folder": "D:\\Backups", "keep": 14})
        self.assertEqual(backup.load_settings(path), {"extra_folder": "D:\\Backups", "keep": 14})


if __name__ == "__main__":
    unittest.main()
