from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from typing import List
from datetime import datetime
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product
from app.core.pdf import generate_invoice_pdf
from app.api.business import default_due_date, document_lines, get_business, next_document_number, price_line, sales_rep_for, totals_for
from app.models.client import Client
from app.core.security import get_current_user, require_admin
from app.models.user import User

router = APIRouter(prefix="/invoices", tags=["Invoices"])


def _recalculate_total(session: Session, invoice: Invoice) -> None:
    items = session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
    invoice.total_amount = totals_for(items)["grand_total"]
    session.add(invoice)

@router.post("/", response_model=Invoice)
def create_invoice(invoice: Invoice, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    invoice.id = None  # the database picks the number
    invoice.date = coerce_datetime(invoice.date) or datetime.utcnow()
    invoice.due_date = coerce_datetime(invoice.due_date) or default_due_date(session, invoice.date)
    invoice.number = next_document_number(session, Invoice)  # only ever assigned here - never taken from the request
    invoice.total_amount = 0.0  # set from the lines as they're added
    invoice.created_by = user.id if user else None
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice

@router.get("/", response_model=List[Invoice])
def read_invoices(session: Session = Depends(get_session)):
    return session.exec(select(Invoice)).all()

@router.get("/client/{client_id}", response_model=List[Invoice])
def read_invoices_by_client(client_id: int, session: Session = Depends(get_session)):
    statement = select(Invoice).where(Invoice.client_id == client_id)
    return session.exec(statement).all()

@router.put("/{invoice_id}", response_model=Invoice)
def update_invoice(invoice_id: int, invoice_data: Invoice, session: Session = Depends(get_session)):
    db_invoice = session.get(Invoice, invoice_id)
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Only the fields actually sent: an edit form that doesn't know about a
    # field (e.g. reference) must not blank it. The number is fixed once
    # assigned, and the total always comes from the lines.
    changes = invoice_data.model_dump(exclude_unset=True, exclude={"id", "number", "total_amount", "created_by"})
    for key in ("date", "due_date"):
        if key in changes:
            changes[key] = coerce_datetime(changes[key])
    for key, value in changes.items():
        setattr(db_invoice, key, value)
    _recalculate_total(session, db_invoice)

    session.add(db_invoice)
    session.commit()
    session.refresh(db_invoice)
    return db_invoice

@router.delete("/{invoice_id}", dependencies=[Depends(require_admin)])
def delete_invoice(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Remove line items first so we don't leave orphaned rows behind.
    statement = select(InvoiceItem).where(InvoiceItem.invoice_id == invoice_id)
    for item in session.exec(statement).all():
        session.delete(item)
    session.delete(invoice)
    session.commit()
    return {"ok": True}

@router.post("/items/", response_model=InvoiceItem)
def add_invoice_item(item: InvoiceItem, session: Session = Depends(get_session)):
    item.id = None  # the database picks the number
    if not session.get(Product, item.product_id):
        raise HTTPException(status_code=404, detail="Product not found")
    invoice = session.get(Invoice, item.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    price_line(session, item)
    session.add(item)
    session.flush()
    _recalculate_total(session, invoice)
    session.commit()
    session.refresh(item)
    return item

@router.get("/{invoice_id}/items", response_model=List[InvoiceItem])
def read_invoice_items(invoice_id: int, session: Session = Depends(get_session)):
    statement = select(InvoiceItem).where(InvoiceItem.invoice_id == invoice_id)
    return session.exec(statement).all()

@router.delete("/items/{item_id}")
def delete_invoice_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(InvoiceItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    invoice_id = item.invoice_id
    session.delete(item)
    session.commit()

    invoice = session.get(Invoice, invoice_id)
    if invoice:
        _recalculate_total(session, invoice)
        session.commit()
    return {"ok": True}

@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    items = session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice_id)).all()
    pdf = generate_invoice_pdf(get_business(session), invoice, session.get(Client, invoice.client_id),
                               document_lines(session, items), sales_rep_for(session, invoice))
    return StreamingResponse(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename={invoice.number or invoice_id}.pdf"
    })
