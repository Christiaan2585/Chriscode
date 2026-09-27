from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.api.business import get_business, next_document_number, price_line, product_label, totals_for
from app.core.dates import coerce_datetime
from app.core.db import get_session
from app.core.pdf import generate_purchase_order_pdf
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, Supplier

router = APIRouter(tags=["Purchase orders"])


def _recalculate_total(session: Session, po: PurchaseOrder) -> None:
    items = session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    po.total_amount = totals_for(items)["grand_total"]
    session.add(po)


def _get_or_404(session: Session, model, row_id: int, label: str):
    row = session.get(model, row_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


# --- Suppliers ---

@router.get("/suppliers/", response_model=List[Supplier])
def read_suppliers(session: Session = Depends(get_session)):
    return session.exec(select(Supplier).order_by(Supplier.name)).all()


@router.post("/suppliers/", response_model=Supplier)
def create_supplier(supplier: Supplier, session: Session = Depends(get_session)):
    supplier.id = None
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.put("/suppliers/{supplier_id}", response_model=Supplier)
def update_supplier(supplier_id: int, data: Supplier, session: Session = Depends(get_session)):
    supplier = _get_or_404(session, Supplier, supplier_id, "Supplier")
    for key, value in data.model_dump(exclude_unset=True, exclude={"id", "created_at"}).items():
        setattr(supplier, key, value)
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, session: Session = Depends(get_session)):
    supplier = _get_or_404(session, Supplier, supplier_id, "Supplier")
    orders = session.exec(select(PurchaseOrder).where(PurchaseOrder.supplier_id == supplier_id)).all()
    if orders:
        raise HTTPException(
            status_code=409,
            detail=f"{supplier.name} has {len(orders)} purchase order(s). Delete those first if you're sure.",
        )
    session.delete(supplier)
    session.commit()
    return {"ok": True}


# --- Purchase orders ---

@router.get("/purchase-orders/", response_model=List[PurchaseOrder])
def read_purchase_orders(session: Session = Depends(get_session)):
    return session.exec(select(PurchaseOrder)).all()


@router.post("/purchase-orders/", response_model=PurchaseOrder)
def create_purchase_order(po: PurchaseOrder, session: Session = Depends(get_session)):
    _get_or_404(session, Supplier, po.supplier_id, "Supplier")
    po.id = None
    po.date = coerce_datetime(po.date) or datetime.utcnow()
    po.delivery_date = coerce_datetime(po.delivery_date)
    po.number = next_document_number(session, PurchaseOrder)  # only ever assigned here - never taken from the request
    po.total_amount = 0.0  # set from the lines as they're added
    session.add(po)
    session.commit()
    session.refresh(po)
    return po


@router.put("/purchase-orders/{po_id}", response_model=PurchaseOrder)
def update_purchase_order(po_id: int, data: PurchaseOrder, session: Session = Depends(get_session)):
    po = _get_or_404(session, PurchaseOrder, po_id, "Purchase order")
    changes = data.model_dump(exclude_unset=True, exclude={"id", "number", "total_amount"})
    for key in ("date", "delivery_date"):
        if key in changes:
            changes[key] = coerce_datetime(changes[key])
    for key, value in changes.items():
        setattr(po, key, value)
    _recalculate_total(session, po)
    session.commit()
    session.refresh(po)
    return po


@router.delete("/purchase-orders/{po_id}")
def delete_purchase_order(po_id: int, session: Session = Depends(get_session)):
    po = _get_or_404(session, PurchaseOrder, po_id, "Purchase order")
    for item in session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).all():
        session.delete(item)
    session.delete(po)
    session.commit()
    return {"ok": True}


@router.get("/purchase-orders/{po_id}/items", response_model=List[PurchaseOrderItem])
def read_purchase_order_items(po_id: int, session: Session = Depends(get_session)):
    return session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).all()


@router.post("/purchase-orders/{po_id}/items", response_model=PurchaseOrderItem)
def add_purchase_order_item(po_id: int, item: PurchaseOrderItem, session: Session = Depends(get_session)):
    po = _get_or_404(session, PurchaseOrder, po_id, "Purchase order")
    item.id = None
    item.purchase_order_id = po_id
    if item.product_id:
        product = _get_or_404(session, Product, item.product_id, "Product")
        item.description = (item.description or "").strip() or product_label(product)
    elif not (item.description or "").strip():
        raise HTTPException(status_code=422, detail="A line without a product needs a description")
    price_line(session, item, default_price_field="cost")
    session.add(item)
    session.flush()
    _recalculate_total(session, po)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/purchase-orders/items/{item_id}")
def delete_purchase_order_item(item_id: int, session: Session = Depends(get_session)):
    item = _get_or_404(session, PurchaseOrderItem, item_id, "Line")
    po = session.get(PurchaseOrder, item.purchase_order_id)
    session.delete(item)
    session.flush()
    if po:
        _recalculate_total(session, po)
    session.commit()
    return {"ok": True}


@router.get("/purchase-orders/{po_id}/pdf")
def download_purchase_order_pdf(po_id: int, session: Session = Depends(get_session)):
    po = _get_or_404(session, PurchaseOrder, po_id, "Purchase order")
    supplier = session.get(Supplier, po.supplier_id)
    items = read_purchase_order_items(po_id, session)
    pdf = generate_purchase_order_pdf(get_business(session), po, supplier, items)
    return StreamingResponse(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename={po.number or po_id}.pdf"
    })
