"""Send a brochure (a PDF in the catalogue library) to several chosen clients. Email goes out through the business's
own mail server (app/core/mailer.py): one message per client with their own name in the greeting, so nobody sees
anyone else's address. A client without an address is skipped and named; a refused address is reported and the rest
carry on; a mail server that can't be reached (or refuses the login) stops the run at once instead of trying every
client. WhatsApp can't be automated, so the screen notes those sends with `record_send`."""
import os
from typing import List

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core import catalogue_library as lib, mailer
from app.models.brochure import BrochureSend
from app.models.client import Client

MAX_CLIENTS = 200


def _find(catalogue_id: str) -> dict:
    entry = next((e for e in lib.list_catalogues() if e["id"] == catalogue_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="That brochure isn't in the list")
    return entry


def record_send(session: Session, catalogue_id: str, client_id: int, via: str) -> None:
    _find(catalogue_id)
    if session.get(Client, client_id) is None:
        raise HTTPException(status_code=404, detail="Client not found")
    session.add(BrochureSend(catalogue_id=catalogue_id, client_id=client_id, via=via))
    session.commit()


def latest_sends(session: Session, catalogue_id: str) -> dict:
    out = {}
    for row in session.exec(select(BrochureSend).where(BrochureSend.catalogue_id == catalogue_id).order_by(BrochureSend.at, BrochureSend.id)).all():
        out[row.client_id] = {"via": row.via, "at": row.at}
    return out


def email_to_clients(session: Session, catalogue_id: str, client_ids: List[int], subject: str, message: str) -> dict:
    if len(client_ids) > MAX_CLIENTS:
        raise HTTPException(status_code=422, detail=f"Send to at most {MAX_CLIENTS} clients at a time")
    entry = _find(catalogue_id)
    if not mailer.is_configured(session):
        raise HTTPException(status_code=409, detail="Email isn't set up yet - an admin can do that in Settings -> Email")
    with open(lib.pdf_path(catalogue_id), "rb") as f:
        pdf = f.read()
    if len(pdf) > mailer.MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="That brochure is too big to email - use WhatsApp, or a smaller PDF")

    result = {"sent": [], "skipped": [], "failed": [], "not_sent": [], "stopped": None}
    seen = set()
    queue = [c for c in dict.fromkeys(client_ids)]
    for position, client_id in enumerate(queue):
        client = session.get(Client, client_id)
        if client is None or client_id in seen:
            continue
        seen.add(client_id)
        row = {"client_id": client.id, "name": client.farm_name or client.name}
        address = (client.email or "").strip()
        if not address:
            result["skipped"].append({**row, "reason": "No email address"})
            continue
        try:
            mailer.send_message(session, address, subject, (message or "").replace("{name}", client.name), entry["name"], pdf)
        except HTTPException as exc:
            if exc.status_code == 502 and "refused that email address" in str(exc.detail):
                result["failed"].append({**row, "reason": "The mail server refused this address"})
                continue
            result["stopped"] = str(exc.detail)
            result["not_sent"] = [{"client_id": c.id, "name": c.farm_name or c.name}
                                  for c in (session.get(Client, i) for i in queue[position:]) if c is not None]
            break
        session.add(BrochureSend(catalogue_id=catalogue_id, client_id=client.id, via="email"))
        session.commit()
        result["sent"].append({**row, "email": address})
    return result
