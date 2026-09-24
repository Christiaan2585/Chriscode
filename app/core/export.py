"""Export every business table to one Excel workbook (one sheet per table).

Login secrets - password/PIN hashes and remember-device tokens - are never
exported; everything else is, so the file doubles as a human-readable copy
of the data an accountant or a future system can open without this app.
"""
import sqlite3
from pathlib import Path

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE

EXCLUDED_TABLES = frozenset({"user", "remembertoken"})


def _clean(value):
    # Free-text fields (notes etc.) can hold control characters that
    # openpyxl refuses to write, which would abort the whole export.
    if isinstance(value, str):
        return ILLEGAL_CHARACTERS_RE.sub("", value)
    return value


def build_workbook(db_path: str, exclude=EXCLUDED_TABLES) -> Workbook:
    wb = Workbook()
    wb.remove(wb.active)
    conn = sqlite3.connect(Path(db_path).resolve().as_uri() + "?mode=ro", uri=True)
    try:
        tables = [row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
        for table in tables:
            if table in exclude:
                continue
            cursor = conn.execute(f'SELECT * FROM "{table}"')
            ws = wb.create_sheet(title=table[:31])
            ws.append([col[0] for col in cursor.description])
            for row in cursor:
                ws.append([_clean(v) for v in row])
    finally:
        conn.close()
    return wb
