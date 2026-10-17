"""The dashboard's "today" card: what was done today and what is still waiting. Counts only - no client details."""
from datetime import date, datetime, time, timedelta

from sqlmodel import Session, func, select

from app.core import dashboard, settlement
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.quote import Quote
from app.models.sends import DocumentSend


def _between(column, day: date):
    start = datetime.combine(day, time.min)
    return column >= start, column < start + timedelta(days=1)


def summary(session: Session, today: date) -> dict:
    invoices = session.exec(select(Invoice).where(*_between(Invoice.date, today), Invoice.status != "cancelled")).all()
    payments = session.exec(select(Payment).where(*_between(Payment.date, today))).all()
    sent = session.exec(select(func.count()).select_from(DocumentSend).where(*_between(DocumentSend.at, today))).one()
    new_clients = session.exec(select(func.count()).select_from(Client).where(*_between(Client.created_at, today))).one()

    business = session.get(BusinessSettings, 1) or BusinessSettings()
    unpaid = session.exec(select(Invoice).where(Invoice.status == "unpaid")).all()
    owed = settlement.outstanding(session, unpaid)
    due_of = lambda inv: dashboard._day(inv.due_date) if inv.due_date else dashboard._day(inv.date) + timedelta(days=business.payment_terms_days or 0)
    late = [inv for inv in unpaid if owed[inv.id] > 0 and due_of(inv) < today]
    quotes_waiting = session.exec(select(func.count()).select_from(Quote).where(Quote.status == "Sent")).one()
    return {
        "invoices": {"count": len(invoices), "total": round(sum(i.total_amount or 0 for i in invoices), 2)},
        "payments": {"count": len(payments), "total": round(sum(p.amount or 0 for p in payments), 2)},
        "sent": sent,
        "new_clients": new_clients,
        "waiting": {"overdue_invoices": len(late), "overdue_total": round(sum(owed[i.id] for i in late), 2), "quotes": quotes_waiting},
    }
