from datetime import datetime
from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from typing import Dict
from app.core.db import get_session
from app.models.invoice import Invoice

router = APIRouter(prefix="/analytics", tags=["Analytics"])

def _add_months(date: datetime, months: int) -> datetime:
    total_month_index = date.month - 1 + months
    year = date.year + total_month_index // 12
    month = total_month_index % 12 + 1
    return date.replace(year=year, month=month)

@router.get("/revenue", response_model=Dict)
def get_revenue_stats(session: Session = Depends(get_session)):
    # Total revenue
    statement = select(func.sum(Invoice.total_amount))
    total = session.exec(statement).first() or 0.0

    # Unpaid revenue
    statement_unpaid = select(func.sum(Invoice.total_amount)).where(Invoice.status == "unpaid")
    unpaid = session.exec(statement_unpaid).first() or 0.0

    return {
        "total_revenue": total,
        "outstanding_balance": unpaid,
        "collected": total - unpaid
    }

@router.get("/revenue-by-month")
def get_revenue_by_month(months: int = 12, session: Session = Depends(get_session)):
    """Paid-invoice revenue for each of the last `months` months (oldest
    first), for the dashboard's sales chart. Months with no paid invoices
    still appear with total 0, rather than being skipped, so the chart's
    x-axis is a continuous timeline instead of jumping over gaps."""
    now = datetime.utcnow()
    start = _add_months(now.replace(day=1), -(months - 1))

    paid_invoices = session.exec(
        select(Invoice).where(Invoice.status == "paid", Invoice.date >= start)
    ).all()

    totals_by_key = {}
    for invoice in paid_invoices:
        key = invoice.date.strftime("%Y-%m")
        totals_by_key[key] = totals_by_key.get(key, 0.0) + invoice.total_amount

    result = []
    for i in range(months):
        month_date = _add_months(start, i)
        key = month_date.strftime("%Y-%m")
        result.append({
            "month": key,
            "label": month_date.strftime("%b %Y"),
            "revenue": round(totals_by_key.get(key, 0.0), 2),
        })
    return result
