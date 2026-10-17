"""Payment reminders by email, in bulk: one message per overdue invoice with the invoice attached, written in the
client's language. Same rules as the month-end statements: no address / not overdue / nothing owing are skipped with the
reason, a refused address is listed and the rest still go, and a dead mail server stops the run and lists who is left."""
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.api.business import document_lines, get_business, sales_rep_for
from app.core import mailer, message_templates, settlement
from app.core.pdf import generate_invoice_pdf
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem
from app.models.sends import DocumentSend

MAX_INVOICES = 200

# Same wording as the Reminder bell on the Invoices page (desktop-app/frontend/src/utils/clientSend.js).
_WORDS = {
    "en": ("Payment reminder - invoice {number}",
           "Good day {name}, a friendly reminder that invoice {number} for {amount} {dueClause}. If you have already paid, please ignore this message and thank you. The invoice is attached."),
    "af": ("Betalingsherinnering - faktuur {number}",
           "Goeie dag {name}, 'n vriendelike herinnering dat faktuur {number} vir {amount} {dueClause}. Indien u reeds betaal het, ignoreer asseblief hierdie boodskap en dankie. Die faktuur is aangeheg."),
}
_AF_MONTHS = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"]
_EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _day(value) -> date:
    return value.date() if isinstance(value, datetime) else value


def due_date(session: Session, invoice: Invoice) -> date:
    if invoice.due_date:
        return _day(invoice.due_date)
    return _day(invoice.date) + timedelta(days=get_business(session).payment_terms_days or 0)


def overdue_invoices(session: Session, today: date) -> list:
    """Every unpaid invoice past its due date that still has a balance, oldest first, with what is owed."""
    unpaid = session.exec(select(Invoice).where(Invoice.status == "unpaid")).all()
    owed = settlement.outstanding(session, unpaid)
    rows = []
    for inv in unpaid:
        due = due_date(session, inv)
        if owed[inv.id] > 0 and due < today:
            client = session.get(Client, inv.client_id)
            rows.append({"invoice_id": inv.id, "number": inv.number or f"#{inv.id}", "client_id": inv.client_id,
                         "client": (client.farm_name or client.name) if client else "",
                         "email": (client.email or "").strip() if client else "",
                         "owed": owed[inv.id], "due": due.isoformat(), "days_overdue": (today - due).days})
    return sorted(rows, key=lambda r: r["due"])


def invoice_pdf(session: Session, invoice: Invoice) -> bytes:
    items = session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
    return generate_invoice_pdf(get_business(session), invoice, session.get(Client, invoice.client_id),
                                document_lines(session, items), sales_rep_for(session, invoice),
                                balance=settlement.invoice_balance(session, invoice)["balance"]).getvalue()


def _message(client: Client, invoice: Invoice, owed: float, due: date, templates: Optional[dict]) -> tuple:
    lang = "af" if client.language == "af" else "en"
    months = _AF_MONTHS if lang == "af" else _EN_MONTHS
    when = f"{due.day} {months[due.month - 1]} {due.year}"
    clause = f"op {when} verskuldig was" if lang == "af" else f"was due on {when}"
    subject, body = _WORDS[lang]
    custom = ((templates or {}).get(lang) or {}).get("reminder") or {}
    values = {"name": client.name, "number": invoice.number or f"#{invoice.id}", "amount": f"R{owed:,.2f}", "dueClause": clause}
    return (message_templates.fill(custom.get("subject") or subject, values),
            message_templates.fill(custom.get("body") or body, values))


def email_reminders(session: Session, invoice_ids: List[int], today: date) -> dict:
    if len(invoice_ids) > MAX_INVOICES:
        raise HTTPException(status_code=422, detail=f"Send at most {MAX_INVOICES} reminders at a time")
    if not mailer.is_configured(session):
        raise HTTPException(status_code=409, detail="Email isn't set up yet - an admin can do that in Settings -> Email")

    templates = message_templates.load(get_business(session).message_templates)
    result = {"sent": [], "skipped": [], "failed": [], "not_sent": [], "stopped": None}
    queue = list(dict.fromkeys(invoice_ids))
    for position, invoice_id in enumerate(queue):
        invoice = session.get(Invoice, invoice_id)
        client = session.get(Client, invoice.client_id) if invoice else None
        if invoice is None or client is None:
            continue
        label = client.farm_name or client.name
        row = {"invoice_id": invoice.id, "number": invoice.number or f"#{invoice.id}", "name": label}
        address = (client.email or "").strip()
        owed = settlement.invoice_balance(session, invoice)["balance"]
        due = due_date(session, invoice)
        if invoice.status != "unpaid" or owed <= 0:
            result["skipped"].append({**row, "reason": "Nothing owing"})
            continue
        if due >= today:
            result["skipped"].append({**row, "reason": "Not overdue"})
            continue
        if not address:
            result["skipped"].append({**row, "reason": "No email address"})
            continue
        subject, body = _message(client, invoice, owed, due, templates)
        try:
            mailer.send_message(session, address, subject, body, f"{row['number']}.pdf", invoice_pdf(session, invoice))
        except HTTPException as exc:
            if exc.status_code == 502 and "refused that email address" in str(exc.detail):
                result["failed"].append({**row, "reason": "The mail server refused this address"})
                continue
            result["stopped"] = str(exc.detail)
            rest = [session.get(Invoice, i) for i in queue[position:]]
            result["not_sent"] = [{"invoice_id": i.id, "number": i.number or f"#{i.id}"} for i in rest if i is not None]
            break
        session.add(DocumentSend(kind="reminder", doc_id=invoice.id, via="app-email", client_id=client.id, to_address=address))
        session.commit()
        result["sent"].append({**row, "email": address})
    return result
