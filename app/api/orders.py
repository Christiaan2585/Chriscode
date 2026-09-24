from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.order import Order

router = APIRouter(prefix="/orders", tags=["Orders"])

@router.post("/", response_model=Order)
def create_order(order: Order, session: Session = Depends(get_session)):
    order.date = coerce_datetime(order.date)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

@router.get("/", response_model=List[Order])
def read_orders(session: Session = Depends(get_session)):
    return session.exec(select(Order)).all()

@router.get("/client/{client_id}", response_model=List[Order])
def read_orders_by_client(client_id: int, session: Session = Depends(get_session)):
    statement = select(Order).where(Order.client_id == client_id)
    return session.exec(statement).all()

@router.get("/{order_id}", response_model=Order)
def read_order(order_id: int, session: Session = Depends(get_session)):
    order = session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/{order_id}", response_model=Order)
def update_order(order_id: int, order_data: Order, session: Session = Depends(get_session)):
    db_order = session.get(Order, order_id)
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")

    order_data.date = coerce_datetime(order_data.date)

    # Excluding "id" matters: order_data.id is unset on a normal edit payload
    # (the id lives in the URL, not the body), so Pydantic fills it with its
    # default of None - applying it via setattr would null out the primary
    # key on every edit and break the update.
    for key, value in order_data.dict(exclude={"id"}).items():
        setattr(db_order, key, value)

    session.add(db_order)
    session.commit()
    session.refresh(db_order)
    return db_order

@router.delete("/{order_id}")
def delete_order(order_id: int, session: Session = Depends(get_session)):
    order = session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    session.delete(order)
    session.commit()
    return {"ok": True}
