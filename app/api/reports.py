# Statements, aged debtors and the accountant's export (logic in app/core/reports.py).
# Behind main.py's router-wide sign-in; the accountant's export is admin-only.
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlmodel import Session

from app.core import reports
from app.core.db import get_session
from app.core.security import require_admin
from app.models.client import Client

router = APIRouter(prefix="/reports", tags=["Reports"])


def _period(start: Optional[date], end: Optional[date]) -> tuple:
    end = end or date.today()
    start = start or end - timedelta(days=90)
    if start > end:
        raise HTTPException(status_code=422, detail="The start date is after the end date")
    return start, end


def _client_or_404(session: Session, client_id: int) -> Client:
    client = session.get(Client, client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.get("/aged-debtors")
def aged_debtors(session: Session = Depends(get_session)):
    return reports.aged_debtors(session, date.today())


@router.get("/clients/{client_id}/statement")
def statement(client_id: int, start: Optional[date] = None, end: Optional[date] = None, session: Session = Depends(get_session)):
    _client_or_404(session, client_id)
    return reports.client_statement(session, client_id, *_period(start, end))


@router.get("/clients/{client_id}/statement.pdf")
def statement_pdf(client_id: int, start: Optional[date] = None, end: Optional[date] = None, session: Session = Depends(get_session)):
    _client_or_404(session, client_id)
    start, end = _period(start, end)
    pdf = reports.statement_pdf(session, client_id, start, end)
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="statement-{client_id}-{end}.pdf"'})


@router.get("/accounting.xlsx", dependencies=[Depends(require_admin)])
def accounting(start: Optional[date] = None, end: Optional[date] = None, session: Session = Depends(get_session)):
    start, end = _period(start, end)
    return Response(reports.accounting_workbook(session, start, end),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="sandveld-accounts-{start}-to-{end}.xlsx"'})
