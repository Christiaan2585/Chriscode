from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from typing import List, Dict
from app.core.db import get_session
from app.models.invoice import Invoice

router = APIRouter(prefix="/analytics", tags=["Analytics"])

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
