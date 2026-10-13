# The Stock menu on the Purchase Orders page: what is on the shelf, a timeline of every movement (sold, received,
# counted, adjusted) and manual adjustments. Counting itself is POST /products/{id}/stock-count. The automatic part
# - invoices taking stock off, received orders adding it - lives in app/core/stock.py. For anyone signed in.
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, func, select

from app.core import stock
from app.core.db import get_session
from app.core.security import get_current_user
from app.models.product import Product, StockMovement
from app.models.user import User

router = APIRouter(prefix="/stock", tags=["Stock"])
MAX_LIMIT = 500


class StockAdjust(BaseModel):
    change: float = Field(le=10_000_000, ge=-10_000_000)
    note: str = Field(min_length=1, max_length=200)

    @field_validator("change")
    @classmethod
    def not_nothing(cls, value: float) -> float:
        if value == 0:
            raise ValueError("An adjustment needs a number other than 0")
        return value

    @field_validator("note")
    @classmethod
    def reason_given(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Say why the stock is being adjusted")
        return value.strip()


def _status(product: Product) -> str:
    if product.stock_quantity is None:
        return "untracked"
    if product.stock_quantity <= 0:
        return "out"
    if product.reorder_level is not None and product.stock_quantity <= product.reorder_level:
        return "low"
    return "ok"


@router.get("/")
def overview(session: Session = Depends(get_session)):
    last = dict(session.exec(select(StockMovement.product_id, func.max(StockMovement.at))
                             .where(StockMovement.reason != "opening").group_by(StockMovement.product_id)).all())
    rows = session.exec(select(Product).where(Product.is_active != False).order_by(Product.name)).all()  # noqa: E712 - NULL = active
    return [{"id": p.id, "name": p.name, "code": p.code, "category": p.category, "stock_quantity": p.stock_quantity,
             "reorder_level": p.reorder_level, "supplier_id": p.supplier_id, "status": _status(p),
             "last_movement": last.get(p.id)} for p in rows]


@router.get("/movements")
def movements(product_id: Optional[int] = None, reason: Optional[Literal["sold", "received", "count", "adjusted"]] = None,
              limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 200, session: Session = Depends(get_session)):
    if not 1 <= limit <= MAX_LIMIT:
        raise HTTPException(status_code=422, detail=f"Ask for between 1 and {MAX_LIMIT} movements")
    query = (select(StockMovement, Product.name, User.name)
             .join(Product, Product.id == StockMovement.product_id)
             .join(User, User.id == StockMovement.created_by, isouter=True)
             .where(StockMovement.reason != "opening")  # old paperwork booked at the start: baseline, not history
             .order_by(StockMovement.at.desc(), StockMovement.id.desc()).limit(limit))
    if product_id is not None:
        query = query.where(StockMovement.product_id == product_id)
    if reason is not None:
        query = query.where(StockMovement.reason == reason)
    return [{"id": m.id, "at": m.at, "product_id": m.product_id, "product_name": product, "change": m.change,
             "reason": m.reason, "reference": m.reference, "note": m.note, "balance": m.balance, "by": by}
            for m, product, by in session.exec(query).all()]


@router.post("/{product_id}/adjust")
def adjust(product_id: int, body: StockAdjust, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.stock_quantity is None:
        raise HTTPException(status_code=409, detail="Count this product first - an adjustment needs a number to adjust")
    stock.adjust(session, product, body.change, body.note, user.id if user else None)
    session.commit()
    return {"stock_quantity": product.stock_quantity}
