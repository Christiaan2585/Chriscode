"""Warn before a second copy of a client is made: the same phone number, email, farm name or name as someone already
on file. Only a warning - two people can share a name, and a farm can have two contacts."""
import re
from typing import Optional

from sqlmodel import Session, select

from app.models.client import Client

MIN_PHONE_DIGITS = 7
PHONE_TAIL = 9  # compare the last nine digits, so 082 555 1234 and +27 82 555 1234 are the same number


def _digits(value) -> str:
    return re.sub(r"\D", "", value or "")


def _norm(value) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _tail(value) -> str:
    digits = _digits(value)
    return digits[-PHONE_TAIL:] if len(digits) >= MIN_PHONE_DIGITS else ""


def find(session: Session, name: Optional[str] = None, phone: Optional[str] = None, email: Optional[str] = None,
         farm_name: Optional[str] = None, exclude_id: Optional[int] = None) -> list:
    checks = (("same email", _norm(email), lambda c: _norm(c.email)),
              ("same phone number", _tail(phone), lambda c: _tail(c.phone)),
              ("same farm name", _norm(farm_name), lambda c: _norm(c.farm_name)),
              ("same name", _norm(name), lambda c: _norm(c.name)))
    found = []
    for client in session.exec(select(Client)).all():
        if client.id == exclude_id:
            continue
        why = [reason for reason, wanted, have in checks if wanted and have(client) == wanted]
        if why:
            found.append({"id": client.id, "name": client.name, "farm_name": client.farm_name, "why": why})
    return found
