"""What is still owed on an invoice: its total, less payments received and credit notes issued. The invoice's
paid/unpaid status follows from that balance (a cancelled invoice stays cancelled). Shared by the payments API, the
dashboard, client statements, the aged-debtors report and the accountant's export."""
from collections import defaultdict
from decimal import Decimal

from sqlmodel import Session, select

from app.core.documents import _money
from app.models.invoice import Invoice
from app.models.payment import CreditNote, Payment


def _sum(values) -> float:
    return float(sum((_money(v) for v in values), Decimal("0")))


def invoice_balance(session: Session, invoice: Invoice) -> dict:
    paid = _sum(p.amount for p in session.exec(select(Payment).where(Payment.invoice_id == invoice.id)).all())
    credited = _sum(c.amount for c in session.exec(select(CreditNote).where(CreditNote.invoice_id == invoice.id)).all())
    total = float(_money(invoice.total_amount or 0))
    return {"total": total, "paid": paid, "credited": credited, "balance": float(_money(total - paid - credited))}


def all_balances(session: Session) -> dict:
    """{invoice id: balance dict} for every invoice, in three queries."""
    paid, credited = defaultdict(float), defaultdict(float)
    for p in session.exec(select(Payment)).all():
        paid[p.invoice_id] += p.amount
    for c in session.exec(select(CreditNote)).all():
        credited[c.invoice_id] += c.amount
    out = {}
    for inv in session.exec(select(Invoice)).all():
        total = float(_money(inv.total_amount or 0))
        p, c = float(_money(paid[inv.id])), float(_money(credited[inv.id]))
        out[inv.id] = {"total": total, "paid": p, "credited": c, "balance": float(_money(total - p - c))}
    return out


def refresh_status(session: Session, invoice: Invoice) -> None:
    """paid when nothing is left to pay (or the client is owed), else unpaid. Cancelled stays cancelled."""
    if invoice.status == "cancelled":
        return
    balance = invoice_balance(session, invoice)
    settled = balance["total"] > 0 and balance["balance"] <= 0
    invoice.status = "paid" if settled else "unpaid"
    session.add(invoice)


def outstanding(session: Session, invoices) -> dict:
    """{invoice id: balance} for the given invoices - what the dashboard and reports count as owed."""
    ids = [i.id for i in invoices]
    if not ids:
        return {}
    paid, credited = defaultdict(float), defaultdict(float)
    for p in session.exec(select(Payment).where(Payment.invoice_id.in_(ids))).all():
        paid[p.invoice_id] += p.amount
    for c in session.exec(select(CreditNote).where(CreditNote.invoice_id.in_(ids))).all():
        credited[c.invoice_id] += c.amount
    return {i.id: float(_money((i.total_amount or 0) - paid[i.id] - credited[i.id])) for i in invoices}
