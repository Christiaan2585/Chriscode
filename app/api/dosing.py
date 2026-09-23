from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from app.core.db import get_session
from app.models.product_dosing import ProductDosing

router = APIRouter(prefix="/dosing", tags=["Dosing"])


@router.get("/", response_model=List[ProductDosing])
def list_dosing(session: Session = Depends(get_session)):
    """All dosing rules, for every product/species. The Calculator fetches this
    once and filters client-side rather than doing a round trip per product."""
    return session.exec(select(ProductDosing)).all()


@router.get("/product/{product_id}", response_model=List[ProductDosing])
def dosing_for_product(product_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(ProductDosing).where(ProductDosing.product_id == product_id)
    ).all()


@router.post("/", response_model=ProductDosing)
def create_dosing(dosing: ProductDosing, session: Session = Depends(get_session)):
    """Add a dosing rule by hand - e.g. a product that has none yet, entered
    straight off the physical label. Marked "unverified" unless the caller says
    otherwise, since nothing cross-checked it."""
    if not dosing.confidence:
        dosing.confidence = "unverified"
    session.add(dosing)
    session.commit()
    session.refresh(dosing)
    return dosing


@router.put("/{dosing_id}", response_model=ProductDosing)
def update_dosing(dosing_id: int, dosing_data: ProductDosing, session: Session = Depends(get_session)):
    """Correct a dosing rule - e.g. after checking the real product label. Use
    this to fix a "low confidence" entry; bump confidence to "verified" once
    you've confirmed it against the box."""
    db_dosing = session.get(ProductDosing, dosing_id)
    if not db_dosing:
        raise HTTPException(status_code=404, detail="Dosing rule not found")

    for key, value in dosing_data.dict(exclude_unset=True, exclude={"id"}).items():
        setattr(db_dosing, key, value)

    session.add(db_dosing)
    session.commit()
    session.refresh(db_dosing)
    return db_dosing


@router.delete("/{dosing_id}")
def delete_dosing(dosing_id: int, session: Session = Depends(get_session)):
    dosing = session.get(ProductDosing, dosing_id)
    if not dosing:
        raise HTTPException(status_code=404, detail="Dosing rule not found")
    session.delete(dosing)
    session.commit()
    return {"ok": True}
