"""Month-end statements by email: one message per chosen client with their statement of account attached, written in
their language. Clients with no address or nothing owing are skipped (with the reason), a refused address is listed and
the rest still go, and a mail server that is down stops the run and lists who was not sent."""
from datetime import date
from typing import List

from fastapi import HTTPException
from sqlmodel import Session

from app.core import mailer, reports
from app.models.client import Client
from app.models.sends import DocumentSend

MAX_CLIENTS = 200

# Same wording as the Send buttons' statement message (desktop-app/frontend/src/utils/clientSend.js).
_WORDS = {
    "en": ("Your statement of account", "Good day {name}, please find your statement of account attached. Thank you!"),
    "af": ("U rekeningstaat", "Goeie dag {name}, hier is u rekeningstaat aangeheg. Dankie!"),
}


def statement_message(client: Client) -> tuple:
    subject, body = _WORDS["af" if client.language == "af" else "en"]
    return subject, body.format(name=client.name)


def email_statements(session: Session, client_ids: List[int], start: date, end: date) -> dict:
    if len(client_ids) > MAX_CLIENTS:
        raise HTTPException(status_code=422, detail=f"Send to at most {MAX_CLIENTS} clients at a time")
    if not mailer.is_configured(session):
        raise HTTPException(status_code=409, detail="Email isn't set up yet - an admin can do that in Settings -> Email")

    result = {"sent": [], "skipped": [], "failed": [], "not_sent": [], "stopped": None}
    queue = list(dict.fromkeys(client_ids))
    for position, client_id in enumerate(queue):
        client = session.get(Client, client_id)
        if client is None:
            continue
        label = client.farm_name or client.name
        row = {"client_id": client.id, "name": label}
        address = (client.email or "").strip()
        if not address:
            result["skipped"].append({**row, "reason": "No email address"})
            continue
        if reports.client_statement(session, client.id, start, end)["closing_balance"] <= 0:
            result["skipped"].append({**row, "reason": "Nothing owing"})
            continue
        subject, body = statement_message(client)
        try:
            mailer.send_message(session, address, subject, body, f"Statement - {label} {end.isoformat()}.pdf",
                                reports.statement_pdf(session, client.id, start, end).getvalue())  # the PDF is a buffer
        except HTTPException as exc:
            if exc.status_code == 502 and "refused that email address" in str(exc.detail):
                result["failed"].append({**row, "reason": "The mail server refused this address"})
                continue
            result["stopped"] = str(exc.detail)
            result["not_sent"] = [{"client_id": c.id, "name": c.farm_name or c.name}
                                  for c in (session.get(Client, i) for i in queue[position:]) if c is not None]
            break
        session.add(DocumentSend(kind="statement", via="app-email", client_id=client.id, to_address=address))
        session.commit()
        result["sent"].append({**row, "email": address})
    return result
