# Payments received and credit notes issued against invoices (see app/core/settlement.py for the balance rules).
# Behind main.py's router-wide sign-in like every business router; removing a payment or credit note is admin-only.
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from app.api.business import get_business, sales_rep_for, totals_for
from app.core import settlement
from app.core.dates import coerce_datetime
from app.core.db import get_session
from app.core.documents import _money, next_number
from app.core.pdf import generate_credit_note_pdf
from app.core.security import get_current_user, require_admin
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import CreditNote, Payment
from app.models.user import User

router = APIRouter(tags=["Payments"])
CREDIT_NOTE_PREFIX = "CRN"


class PaymentIn(BaseModel):
    amount: float = Field(gt=0, le=100_000_000)
    date: Optional[datetime] = None
    method: Literal["EFT", "Cash", "Card", "Other"] = "EFT"
    reference: Optional[str] = Field(default=None, max_length=120)


class CreditNoteIn(BaseModel):
    amount: float = Field(gt=0, le=100_000_000)
    reason: str = Field(min_length=1, max_length=500)
    date: Optional[datetime] = None

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Say why the credit note is issued")
        return value.strip()


def _invoice_or_404(session: Session, invoice_id: int) -> Invoice:
    invoice = session.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


def _open_for_money(invoice: Invoice) -> None:
    if invoice.status == "cancelled":
        raise HTTPException(status_code=409, detail="This invoice is cancelled")


@router.get("/invoices/{invoice_id}/payments")
def invoice_settlement(invoice_id: int, session: Session = Depends(get_session)):
    """The invoice's payments, credit notes and balance."""
    invoice = _invoice_or_404(session, invoice_id)
    paid = session.exec(select(Payment).where(Payment.invoice_id == invoice_id).order_by(Payment.date)).all()
    notes = session.exec(select(CreditNote).where(CreditNote.invoice_id == invoice_id).order_by(CreditNote.date)).all()
    return {**settlement.invoice_balance(session, invoice),
            "payments": [p.model_dump() for p in paid], "credit_notes": [c.model_dump() for c in notes]}


@router.post("/invoices/{invoice_id}/payments", response_model=Payment)
def record_payment(invoice_id: int, data: PaymentIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    invoice = _invoice_or_404(session, invoice_id)
    _open_for_money(invoice)
    amount = float(_money(data.amount))
    if amount > settlement.invoice_balance(session, invoice)["balance"] + 0.001:
        raise HTTPException(status_code=422, detail="That is more than is still owed on this invoice")
    payment = Payment(invoice_id=invoice.id, client_id=invoice.client_id, amount=amount,
                      date=coerce_datetime(data.date) or datetime.utcnow(), method=data.method,
                      reference=(data.reference or "").strip() or None, created_by=user.id if user else None)
    session.add(payment)
    session.flush()
    settlement.refresh_status(session, invoice)
    session.commit()
    session.refresh(payment)
    return payment


@router.delete("/payments/{payment_id}", dependencies=[Depends(require_admin)])
def delete_payment(payment_id: int, session: Session = Depends(get_session)):
    payment = session.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    invoice = session.get(Invoice, payment.invoice_id)
    session.delete(payment)
    session.flush()
    if invoice is not None:
        settlement.refresh_status(session, invoice)
    session.commit()
    return {"ok": True}


@router.post("/invoices/{invoice_id}/credit-notes", response_model=CreditNote)
def issue_credit_note(invoice_id: int, data: CreditNoteIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    invoice = _invoice_or_404(session, invoice_id)
    _open_for_money(invoice)
    amount = float(_money(data.amount))
    balance = settlement.invoice_balance(session, invoice)
    if amount > balance["total"] - balance["credited"] + 0.001:
        raise HTTPException(status_code=422, detail="That is more than the invoice still has to credit")
    # The VAT part in the invoice's own proportion (VAT total / grand total), so a part credit reverses VAT correctly.
    totals = totals_for(session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all())
    vat = float(_money(amount * totals["total_vat"] / totals["grand_total"])) if totals["grand_total"] else 0.0
    used = session.exec(select(CreditNote.number)).all()
    note = CreditNote(number=next_number(used, CREDIT_NOTE_PREFIX), invoice_id=invoice.id, client_id=invoice.client_id,
                      date=coerce_datetime(data.date) or datetime.utcnow(), amount=amount, vat_amount=vat,
                      reason=data.reason, created_by=user.id if user else None)
    session.add(note)
    session.flush()
    settlement.refresh_status(session, invoice)
    session.commit()
    session.refresh(note)
    return note


@router.delete("/credit-notes/{note_id}", dependencies=[Depends(require_admin)])
def delete_credit_note(note_id: int, session: Session = Depends(get_session)):
    note = session.get(CreditNote, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Credit note not found")
    invoice = session.get(Invoice, note.invoice_id)
    session.delete(note)
    session.flush()
    if invoice is not None:
        settlement.refresh_status(session, invoice)
    session.commit()
    return {"ok": True}


@router.get("/credit-notes/{note_id}/pdf")
def credit_note_pdf(note_id: int, session: Session = Depends(get_session)):
    note = session.get(CreditNote, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Credit note not found")
    invoice = session.get(Invoice, note.invoice_id)
    pdf = generate_credit_note_pdf(get_business(session), note, invoice, session.get(Client, note.client_id),
                                   sales_rep_for(session, invoice) if invoice else (None, None))
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={note.number}.pdf"})


@router.get("/payments/balances")
def all_balances(session: Session = Depends(get_session)):
    """{invoice id: {total, paid, credited, balance}} for the invoice lists."""
    return {str(k): v for k, v in settlement.all_balances(session).items()}
