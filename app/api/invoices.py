from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product
from app.core.pdf import generate_invoice_pdf

router = APIRouter(prefix="/invoices", tags=["Invoices"])

@router.post("/", response_model=Invoice)
def create_invoice(invoice: Invoice, session: Session = Depends(get_session)):
    invoice.date = coerce_datetime(invoice.date)
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

    invoice_data.date = coerce_datetime(invoice_data.date)

    # Exclude "id": unset on a normal edit payload, so applying it via setattr
    # would null out the primary key and break the update.
    for key, value in invoice_data.dict(exclude={"id"}).items():
        setattr(db_invoice, key, value)

    session.add(db_invoice)
    session.commit()
    session.refresh(db_invoice)
    return db_invoice

@router.delete("/{invoice_id}")
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
    # Verify product exists and update subtotal
    product = session.get(Product, item.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    item.unit_price = product.price
    item.subtotal = item.quantity * item.unit_price

    session.add(item)
    session.commit()
    session.refresh(item)

    # Update invoice total
    invoice = session.get(Invoice, item.invoice_id)
    statement = select(InvoiceItem).where(InvoiceItem.invoice_id == item.invoice_id)
    items = session.exec(statement).all()
    invoice.total_amount = sum(i.subtotal for i in items)
    session.add(invoice)
    session.commit()

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

    # Recompute the invoice total now that an item is gone, same as add_invoice_item does.
    invoice = session.get(Invoice, invoice_id)
    if invoice:
        statement = select(InvoiceItem).where(InvoiceItem.invoice_id == invoice_id)
        items = session.exec(statement).all()
        invoice.total_amount = sum(i.subtotal for i in items)
        session.add(invoice)
        session.commit()
    return {"ok": True}

@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    from app.models.client import Client
    client = session.get(Client, invoice.client_id)

    statement = select(InvoiceItem).where(InvoiceItem.invoice_id == invoice_id)
    items = session.exec(statement).all()

    # Enrich items with product names for the PDF
    enriched_items = []
    for item in items:
        prod = session.get(Product, item.product_id)
        enriched_items.append({**item.dict(), "product_name": prod.name if prod else "Unknown"})

    pdf_buffer = generate_invoice_pdf(invoice.dict(), enriched_items, client.dict())

    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=invoice_{invoice_id}.pdf"
    })
