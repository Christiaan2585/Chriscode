from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from typing import List, Optional
from app.core.db import get_session
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from app.models.product import Product
from app.models.client import Client
from app.core.pdf import generate_quote_pdf

router = APIRouter(prefix="/quotes", tags=["Quotes"])

@router.post("/", response_model=Quote)
def create_quote(quote: Quote, session: Session = Depends(get_session)):
    session.add(quote)
    session.commit()
    session.refresh(quote)
    return quote

@router.get("/", response_model=List[Quote])
def read_quotes(session: Session = Depends(get_session)):
    return session.exec(select(Quote)).all()

@router.get("/client/{client_id}", response_model=List[Quote])
def read_quotes_by_client(client_id: int, session: Session = Depends(get_session)):
    statement = select(Quote).where(Quote.client_id == client_id)
    return session.exec(statement).all()

@router.get("/{quote_id}", response_model=Quote)
def read_quote(quote_id: int, session: Session = Depends(get_session)):
    quote = session.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    return quote

@router.put("/{quote_id}", response_model=Quote)
def update_quote(quote_id: int, quote_data: Quote, session: Session = Depends(get_session)):
    db_quote = session.get(Quote, quote_id)
    if not db_quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Excluding "id" matters: quote_data.id is unset on a normal edit payload
    # (the id lives in the URL, not the body), so Pydantic fills it with its
    # default of None - applying it via setattr would null out the primary
    # key on every edit and break the update.
    for key, value in quote_data.dict(exclude={"id"}).items():
        setattr(db_quote, key, value)

    session.add(db_quote)
    session.commit()
    session.refresh(db_quote)
    return db_quote

@router.delete("/{quote_id}")
def delete_quote(quote_id: int, session: Session = Depends(get_session)):
    quote = session.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    # Remove line items first so we don't leave orphaned rows behind
    # (matches how delete_invoice handles InvoiceItem).
    statement = select(QuoteItem).where(QuoteItem.quote_id == quote_id)
    for item in session.exec(statement).all():
        session.delete(item)
    session.delete(quote)
    session.commit()
    return {"ok": True}

@router.post("/{quote_id}/items", response_model=QuoteItem)
def add_quote_item(quote_id: int, item: QuoteItem, session: Session = Depends(get_session)):
    item.quote_id = quote_id
    session.add(item)
    session.commit()
    session.refresh(item)
    return item

@router.get("/{quote_id}/items", response_model=List[QuoteItem])
def read_quote_items(quote_id: int, session: Session = Depends(get_session)):
    statement = select(QuoteItem).where(QuoteItem.quote_id == quote_id)
    return session.exec(statement).all()

@router.delete("/items/{item_id}")
def delete_quote_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(QuoteItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    session.delete(item)
    session.commit()
    return {"ok": True}

@router.get("/{quote_id}/pdf")
def download_quote_pdf(quote_id: int, session: Session = Depends(get_session)):
    quote = session.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    client = session.get(Client, quote.client_id)

    statement = select(QuoteItem).where(QuoteItem.quote_id == quote_id)
    items = session.exec(statement).all()

    # Enrich items with product names for the PDF (quote items already carry
    # their own unit_price/subtotal, unlike invoice items which look theirs
    # up from the product - only the display name needs fetching here).
    enriched_items = []
    for item in items:
        prod = session.get(Product, item.product_id)
        enriched_items.append({**item.dict(), "product_name": prod.name if prod else "Unknown"})

    pdf_buffer = generate_quote_pdf(quote.dict(), enriched_items, client.dict())

    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=quote_{quote_id}.pdf"
    })
