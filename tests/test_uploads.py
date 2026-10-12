"""A spreadsheet upload is read with a size limit, so one huge file can't use up the PC's memory."""
import asyncio
import io
import unittest

from fastapi import HTTPException, UploadFile

from app.core.uploads import IMPORT_LIMIT_BYTES, read_capped


def upload(size: int) -> UploadFile:
    return UploadFile(file=io.BytesIO(b"x" * size), filename="sheet.xlsx")


class ReadCappedTests(unittest.TestCase):
    def test_a_file_within_the_limit_is_read_whole(self):
        self.assertEqual(len(asyncio.run(read_capped(upload(1000), 2000))), 1000)

    def test_a_file_over_the_limit_is_refused_with_413(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(read_capped(upload(2001), 2000))
        self.assertEqual(ctx.exception.status_code, 413)

    def test_spreadsheet_imports_are_capped_at_a_sensible_size(self):
        self.assertLessEqual(IMPORT_LIMIT_BYTES, 20 * 1024 * 1024)


class ReadTableTests(unittest.TestCase):
    """Imports read CSV and .xlsx without pandas: every cell as text, header row = column names."""

    def xlsx(self, rows):
        from openpyxl import Workbook
        wb = Workbook()
        for row in rows:
            wb.active.append(row)
        out = io.BytesIO()
        wb.save(out)
        return out.getvalue()

    def test_csv_with_a_byte_order_mark_and_leading_zeros(self):
        from app.core.uploads import read_table
        columns, rows = read_table("c.csv", "﻿Name,Phone\nJan,0821234567\n".encode("utf-8"))
        self.assertEqual(columns, ["Name", "Phone"])
        self.assertEqual(rows, [{"Name": "Jan", "Phone": "0821234567"}])

    def test_csv_saved_by_excel_in_windows_encoding(self):
        from app.core.uploads import read_table
        _, rows = read_table("c.csv", "Name\nRené\n".encode("cp1252"))
        self.assertEqual(rows[0]["Name"], "René")

    def test_xlsx_numbers_become_plain_text_and_blank_cells_none(self):
        from datetime import datetime
        from app.core.uploads import read_table
        data = self.xlsx([["Name", "Count", "Phone", None, "Start"], ["Jan", 12, 821234567, None, datetime(2026, 1, 5)],
                          ["Piet", 2.5, None, None, None], [None, None, None, None, None]])
        columns, rows = read_table("c.xlsx", data)
        self.assertEqual(columns, ["Name", "Count", "Phone", "Start"])  # an unnamed column is left out
        self.assertEqual(rows[0], {"Name": "Jan", "Count": "12", "Phone": "821234567", "Start": "2026-01-05 00:00:00"})
        self.assertEqual(rows[1]["Count"], "2.5")
        self.assertIsNone(rows[1]["Phone"])
        self.assertEqual(len(rows), 2)  # empty rows at the end are not rows

    def test_old_xls_and_garbage_are_refused_with_a_clear_message(self):
        from app.core.uploads import read_table
        with self.assertRaises(HTTPException) as ctx:
            read_table("c.xls", b"\xd0\xcf\x11\xe0")
        self.assertIn(".xlsx", ctx.exception.detail)
        with self.assertRaises(HTTPException) as ctx:
            read_table("c.xlsx", b"not a workbook")
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
