from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from typing import List
from datetime import datetime
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from app.models.client import Client
from app.core.security import get_current_user
from app.models.user import User
from app.core.pdf import generate_quote_pdf
from app.api.business import default_expiry_date, document_lines, get_business, next_document_number, price_line, sales_rep_for, totals_for

router = APIRouter(prefix="/quotes", tags=["Quotes"])


def _recalculate_total(session: Session, quote: Quote) -> None:
    items = session.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id)).all()
    quote.total_amount = totals_for(items)["grand_total"]
    session.add(quote)

@router.post("/", response_model=Quote)
def create_quote(quote: Quote, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    quote.date = coerce_datetime(quote.date) or datetime.utcnow()
    quote.expiry_date = coerce_datetime(quote.expiry_date) or default_expiry_date(session, quote.date)
    quote.number = next_document_number(session, Quote)  # only ever assigned here - never taken from the request
    quote.total_amount = 0.0  # set from the lines as they're added
    quote.created_by = user.id if user else None
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

    # Only the fields actually sent (see update_invoice). "id" matters too:
    # it's unset on an edit payload and would null out the primary key.
    changes = quote_data.model_dump(exclude_unset=True, exclude={"id", "number", "total_amount", "created_by", "items"})
    for key in ("date", "expiry_date"):
        if key in changes:
            changes[key] = coerce_datetime(changes[key])
    for key, value in changes.items():
        setattr(db_quote, key, value)
    _recalculate_total(session, db_quote)

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
    quote = session.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    item.quote_id = quote_id
    price_line(session, item)
    session.add(item)
    session.flush()
    _recalculate_total(session, quote)
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
    quote = session.get(Quote, item.quote_id)
    session.delete(item)
    session.flush()
    if quote:
        _recalculate_total(session, quote)
    session.commit()
    return {"ok": True}

@router.get("/{quote_id}/pdf")
def download_quote_pdf(quote_id: int, session: Session = Depends(get_session)):
    quote = session.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    items = session.exec(select(QuoteItem).where(QuoteItem.quote_id == quote_id)).all()
    pdf = generate_quote_pdf(get_business(session), quote, session.get(Client, quote.client_id),
                             document_lines(session, items), sales_rep_for(session, quote))
    return StreamingResponse(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename={quote.number or quote_id}.pdf"
    })
