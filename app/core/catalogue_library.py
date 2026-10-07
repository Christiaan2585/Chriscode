"""More than one catalogue: any number of extra catalogue PDFs kept in a list,
each one added below the others. They are shown and downloaded as they are
(unlike the supplier's own book, see kyron_catalogue.py, they get no price
column). Stored like that book - files in the data folder's catalogue/library,
not in the database - so they are not in backups: just add them again."""
import io
import json
import os
import re
import uuid
from datetime import datetime

from pypdf import PdfReader

from app.core import kyron_catalogue as kc

_ID = re.compile(r"[0-9a-f]{32}")
_INDEX = "library.json"


class LibraryError(ValueError):
    pass


def library_dir() -> str:
    return os.path.join(kc.catalogue_dir(), "library")


def pdf_path(catalogue_id: str):
    """Where that catalogue's PDF is, or None for an id this library never made
    (so nothing but a generated id can ever reach the file system)."""
    if not isinstance(catalogue_id, str) or not _ID.fullmatch(catalogue_id):
        return None
    return os.path.join(library_dir(), f"{catalogue_id}.pdf")


def _read() -> list:
    try:
        with open(os.path.join(library_dir(), _INDEX), encoding="utf-8") as f:
            entries = json.load(f)
        return entries if isinstance(entries, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write(entries: list) -> None:
    os.makedirs(library_dir(), exist_ok=True)
    path = os.path.join(library_dir(), _INDEX)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(entries, f)
    os.replace(path + ".tmp", path)


def _clean_name(name, fallback: str) -> str:
    name = re.sub(r"\s+", " ", (name or "").strip())[:120]
    return name or re.sub(r"\s+", " ", os.path.splitext(os.path.basename((fallback or "").replace("\\", "/")))[0]).strip()[:120] or "Catalogue"


def list_catalogues() -> list:
    return [e for e in _read() if (p := pdf_path(e.get("id"))) and os.path.exists(p)]


def add_catalogue(data: bytes, filename: str | None, name: str | None = None) -> dict:
    try:
        if not data.startswith(b"%PDF"):
            raise ValueError
        reader = PdfReader(io.BytesIO(data))
        encrypted = reader.is_encrypted
        pages = 0 if encrypted else len(reader.pages)
    except Exception as exc:
        raise LibraryError("That isn't a PDF this app can read") from exc
    if encrypted:
        raise LibraryError("That PDF is password-protected - save an unprotected copy and add that")
    if pages < 1:
        raise LibraryError("That PDF has no pages")
    entry = {"id": uuid.uuid4().hex, "name": _clean_name(name, filename or ""), "filename": (filename or "")[:200],
             "pages": pages, "size": len(data), "uploaded_at": datetime.utcnow().isoformat(timespec="seconds")}
    os.makedirs(library_dir(), exist_ok=True)
    with open(pdf_path(entry["id"]), "wb") as f:
        f.write(data)
    _write(_read() + [entry])
    return entry


def rename_catalogue(catalogue_id: str, name: str) -> dict:
    name = re.sub(r"\s+", " ", (name or "").strip())[:120]
    if not name:
        raise LibraryError("A catalogue needs a name")
    entries = _read()
    entry = next((e for e in entries if e.get("id") == catalogue_id), None)
    if entry is None:
        raise KeyError(catalogue_id)
    entry["name"] = name
    _write(entries)
    return entry


def remove_catalogue(catalogue_id: str) -> bool:
    path = pdf_path(catalogue_id)
    entries = _read()
    kept = [e for e in entries if e.get("id") != catalogue_id]
    if path is None or len(kept) == len(entries):
        return False
    _write(kept)
    if os.path.exists(path):
        os.remove(path)
    return True
