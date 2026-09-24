import os
import sqlite3
import tempfile
import unittest

from app.core.export import build_workbook


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "kyron_agri.db")
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE client (id INTEGER PRIMARY KEY, name TEXT, phone TEXT)")
        conn.execute("INSERT INTO client (name, phone) VALUES ('Jan', '0821234567')")
        conn.execute("CREATE TABLE user (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT)")
        conn.execute("INSERT INTO user (email, password_hash) VALUES ('a@b.c', 'secret-hash')")
        conn.execute("CREATE TABLE remembertoken (id INTEGER PRIMARY KEY, token_hash TEXT)")
        conn.commit()
        conn.close()

    def tearDown(self):
        self.tmp.cleanup()

    def test_one_sheet_per_table_with_headers_and_rows(self):
        wb = build_workbook(self.db)
        ws = wb["client"]
        self.assertEqual([c.value for c in ws[1]], ["id", "name", "phone"])
        self.assertEqual([c.value for c in ws[2]], [1, "Jan", "0821234567"])

    def test_login_secrets_are_never_exported(self):
        wb = build_workbook(self.db)
        self.assertNotIn("user", wb.sheetnames)
        self.assertNotIn("remembertoken", wb.sheetnames)
        for ws in wb.worksheets:
            for row in ws.iter_rows(values_only=True):
                self.assertNotIn("secret-hash", row)


if __name__ == "__main__":
    unittest.main()
