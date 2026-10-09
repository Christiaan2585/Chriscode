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


if __name__ == "__main__":
    unittest.main()
