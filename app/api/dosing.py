from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from typing import List

from app.core.db import get_session
from app.models.product_dosing import ProductDosing

router = APIRouter(prefix="/dosing", tags=["Dosing"])


@router.get("/", response_model=List[ProductDosing])
def list_dosing(session: Session = Depends(get_session)):
    """All dosing rules, for every product/species. The Calculator fetches this
    once and filters client-side rather than doing a round trip per product."""
    return session.exec(select(ProductDosing)).all()
