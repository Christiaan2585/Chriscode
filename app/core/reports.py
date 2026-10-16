"""Money reports: a client's statement of account, the aged-debtors list, and the accountant's Excel export.
Cancelled invoices never count. Balances come from app/core/settlement.py."""
import io
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlmodel import Session, select

from app.api.business import get_business, totals_for
from app.core import settlement
from app.core.documents import _money
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import CreditNote, Payment


def _day(value) -> date:
    return value.date() if isinstance(value, datetime) else value


def _f(value) -> float:
    return float(_money(value or 0))


def _label(client: Optional[Client]) -> str:
    return (client.farm_name or client.name) if client else "Unknown client"


def _invoice_ref(invoice) -> str:
    return invoice.number or f"#{invoice.id}"


# --- Statement of account ---

def client_statement(session: Session, client_id: int, start: date, end: date) -> dict:
    """Every invoice (debit), payment and credit note (credits) of one client in date order, with a running balance.
    Whatever happened before `start` is carried in as the opening balance."""
    invoices = [i for i in session.exec(select(Invoice).where(Invoice.client_id == client_id)).all() if i.status != "cancelled"]
    numbers = {i.id: _invoice_ref(i) for i in invoices}
    entries = [(_day(i.date), 0, _invoice_ref(i), "Invoice", _f(i.total_amount), 0.0) for i in invoices]
    for p in session.exec(select(Payment).where(Payment.client_id == client_id)).all():
        if p.invoice_id in numbers:
            detail = f"Payment ({p.method}){' - ' + p.reference if p.reference else ''} for {numbers[p.invoice_id]}"
            entries.append((_day(p.date), 1, "Payment", detail, 0.0, _f(p.amount)))
    for c in session.exec(select(CreditNote).where(CreditNote.client_id == client_id)).all():
        if c.invoice_id in numbers:
            entries.append((_day(c.date), 2, c.number, f"Credit note for {numbers[c.invoice_id]}: {c.reason}", 0.0, _f(c.amount)))
    entries.sort(key=lambda e: (e[0], e[1]))

    opening = _f(sum(d - c for when, _, _, _, d, c in entries if when < start))
    balance, rows = opening, []
    for when, _, ref, detail, debit, credit in entries:
        if start <= when <= end:
            balance = _f(balance + debit - credit)
            rows.append({"date": when.isoformat(), "reference": ref, "description": detail, "debit": debit, "credit": credit, "balance": balance})
    later = _f(sum(d - c for when, _, _, _, d, c in entries if when > end))
    return {"client_id": client_id, "start": start.isoformat(), "end": end.isoformat(), "opening_balance": opening,
            "closing_balance": balance, "rows": rows, "after_period": later}


def statement_pdf(session: Session, client_id: int, start: date, end: date):
    from app.core.pdf import generate_statement_pdf
    client = session.get(Client, client_id)
    statement = client_statement(session, client_id, start, end)
    aging = next((r for r in aged_debtors(session, end)["clients"] if r["client_id"] == client_id), None)
    return generate_statement_pdf(get_business(session), client, statement, aging)


# --- Aged debtors ---

BUCKETS = ("current", "days_30", "days_60", "days_90", "older")


def _bucket(days_late: int) -> str:
    if days_late <= 0:
        return "current"
    if days_late <= 30:
        return "days_30"
    if days_late <= 60:
        return "days_60"
    if days_late <= 90:
        return "days_90"
    return "older"


def aged_debtors(session: Session, today: date) -> dict:
    """Who owes what, by how late it is: not yet due, 1-30, 31-60, 61-90 and over 90 days past the due date."""
    business = session.get(BusinessSettings, 1) or BusinessSettings()
    unpaid = session.exec(select(Invoice).where(Invoice.status == "unpaid")).all()
    owed = settlement.outstanding(session, unpaid)
    clients = {c.id: c for c in session.exec(select(Client)).all()}
    rows = defaultdict(lambda: {b: 0.0 for b in BUCKETS})
    for inv in unpaid:
        if owed[inv.id] <= 0:
            continue
        due = _day(inv.due_date) if inv.due_date else _day(inv.date) + timedelta(days=business.payment_terms_days or 0)
        rows[inv.client_id][_bucket((today - due).days)] += owed[inv.id]
    out = []
    for client_id, row in rows.items():
        row = {b: _f(v) for b, v in row.items()}
        client = clients.get(client_id)
        out.append({"client_id": client_id, "name": _label(client), "phone": client.phone if client else None,
                    "email": client.email if client else None, **row, "total": _f(sum(row.values()))})
    out.sort(key=lambda r: -r["total"])
    totals = {b: _f(sum(r[b] for r in out)) for b in (*BUCKETS, "total")}
    return {"as_of": today.isoformat(), "clients": out, "totals": totals}


# --- Accountant's export ---

def _plain(cell, value) -> None:
    """Text typed into the app must never become a live formula in Excel (=HYPERLINK, =cmd...)."""
    cell.value = value
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        cell.data_type = "s"


def _sheet(wb, title, header, rows):
    from openpyxl.styles import Font
    ws = wb.create_sheet(title)
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row in rows:
        ws.append([None] * len(row))
        for col, value in enumerate(row, start=1):
            _plain(ws.cell(row=ws.max_row, column=col), value)
    return ws


def accounting_workbook(session: Session, start: date, end: date) -> bytes:
    """Invoices, payments, credit notes and a monthly VAT summary for start..end, for the bookkeeper."""
    lo, hi = datetime.combine(start, time.min), datetime.combine(end, time.max)
    clients = {c.id: c for c in session.exec(select(Client)).all()}
    invoices = session.exec(select(Invoice).where(Invoice.date >= lo, Invoice.date <= hi).order_by(Invoice.date)).all()
    all_invoices = {i.id: i for i in session.exec(select(Invoice)).all()}
    balances = settlement.all_balances(session)
    vat_out, vat_back = defaultdict(float), defaultdict(float)

    inv_rows = []
    for inv in invoices:
        totals = totals_for(session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == inv.id)).all())
        b = balances.get(inv.id, {"paid": 0.0, "credited": 0.0, "balance": inv.total_amount})
        if inv.status != "cancelled":
            vat_out[inv.date.strftime("%Y-%m")] += totals["total_vat"]
        inv_rows.append([_invoice_ref(inv), _day(inv.date), _day(inv.due_date) if inv.due_date else None,
                         _label(clients.get(inv.client_id)), totals["total_exclusive"], totals["total_vat"], _f(inv.total_amount),
                         inv.status, b["paid"], b["credited"], b["balance"]])

    pay_rows = []
    for p in session.exec(select(Payment).where(Payment.date >= lo, Payment.date <= hi).order_by(Payment.date)).all():
        inv = all_invoices.get(p.invoice_id)
        pay_rows.append([_day(p.date), _invoice_ref(inv) if inv else "", _label(clients.get(p.client_id)), p.method,
                         p.reference or "", _f(p.amount)])

    note_rows = []
    for c in session.exec(select(CreditNote).where(CreditNote.date >= lo, CreditNote.date <= hi).order_by(CreditNote.date)).all():
        inv = all_invoices.get(c.invoice_id)
        vat_back[c.date.strftime("%Y-%m")] += c.vat_amount
        note_rows.append([c.number, _day(c.date), _invoice_ref(inv) if inv else "", _label(clients.get(c.client_id)),
                          _f(c.amount - c.vat_amount), _f(c.vat_amount), _f(c.amount), c.reason])

    months = sorted(set(vat_out) | set(vat_back))
    vat_rows = [[m, _f(vat_out[m]), _f(vat_back[m]), _f(vat_out[m] - vat_back[m])] for m in months]

    from openpyxl import Workbook  # only when the workbook is made (keeps start-up quick)
    wb = Workbook()
    wb.remove(wb.active)
    _sheet(wb, "Invoices", ["Number", "Date", "Due", "Client", "Excl VAT", "VAT", "Total", "Status", "Paid", "Credited", "Balance"], inv_rows)
    _sheet(wb, "Payments", ["Date", "Invoice", "Client", "Method", "Reference", "Amount"], pay_rows)
    _sheet(wb, "Credit notes", ["Number", "Date", "Invoice", "Client", "Excl VAT", "VAT", "Total", "Reason"], note_rows)
    _sheet(wb, "VAT", ["Month", "VAT on invoices", "VAT on credit notes", "Net VAT"], vat_rows)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
