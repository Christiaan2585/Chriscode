import math
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.business import get_business, next_document_number, price_line, product_label, sales_rep_for, totals_for
from app.core import stock, trash
from app.core.dates import coerce_datetime
from app.core.db import get_session
from app.core.pdf import generate_purchase_order_pdf
from app.core.security import get_current_user, require_admin
from app.models.product import Product
from app.models.user import User
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, Supplier

router = APIRouter(tags=["Purchase orders"])


def _recalculate_total(session: Session, po: PurchaseOrder) -> None:
    items = session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    po.total_amount = totals_for(items)["grand_total"]
    session.add(po)
    stock.sync_purchase_order(session, po)


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


@router.delete("/suppliers/{supplier_id}", dependencies=[Depends(require_admin)])
@trash.recorded("supplier", "supplier")
def delete_supplier(supplier_id: int, session: Session = Depends(get_session)):
    supplier = _get_or_404(session, Supplier, supplier_id, "Supplier")
    orders = session.exec(select(PurchaseOrder).where(PurchaseOrder.supplier_id == supplier_id)).all()
    if orders:
        raise HTTPException(
            status_code=409,
            detail=f"{supplier.name} has {len(orders)} purchase order(s). Delete those first if you're sure.",
        )
    for product in session.exec(select(Product).where(Product.supplier_id == supplier_id)).all():
        product.supplier_id = None  # no longer anybody's usual supplier
        session.add(product)
    session.delete(supplier)
    session.commit()
    return {"ok": True}


# --- Quick ordering: what is low, and one request that turns the ticked products into an order ---

class QuickLine(BaseModel):
    product_id: int
    quantity: float = Field(gt=0, le=1_000_000)


class QuickOrderIn(BaseModel):
    supplier_id: int
    lines: List[QuickLine] = Field(min_length=1, max_length=200)
    reference: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=1000)  # e.g. where to deliver
    delivery_date: Optional[datetime] = None  # when it is needed by


def _suggested_quantity(product: Product) -> int:
    """Enough to get back to twice the reorder level (at least 1); one when no level is set."""
    if not product.reorder_level:
        return 1
    return max(1, math.ceil(product.reorder_level * 2 - (product.stock_quantity or 0)))


@router.get("/purchase-orders/suggestions")
def order_suggestions(supplier_id: Optional[int] = None, session: Session = Depends(get_session)):
    """The counted products that are low or out of stock, with an amount to order. With a supplier: only the ones
    usually bought from it plus the ones nobody has been chosen for yet."""
    rows = []
    for p in session.exec(select(Product).where(Product.is_active != False).order_by(Product.name)).all():  # noqa: E712 - NULL = active
        if p.stock_quantity is None:
            continue
        status = "out" if p.stock_quantity <= 0 else "low" if p.reorder_level is not None and p.stock_quantity <= p.reorder_level else None
        if status is None or (supplier_id is not None and p.supplier_id not in (None, supplier_id)):
            continue
        rows.append({"id": p.id, "name": p.name, "code": p.code, "packaging": p.packaging, "cost": p.cost, "status": status,
                     "stock_quantity": p.stock_quantity, "reorder_level": p.reorder_level, "supplier_id": p.supplier_id,
                     "suggested_quantity": _suggested_quantity(p)})
    return rows


@router.post("/purchase-orders/quick")
def quick_order(body: QuickOrderIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    supplier = _get_or_404(session, Supplier, body.supplier_id, "Supplier")
    wanted = {}
    for line in body.lines:  # the same product ticked twice is one line
        wanted[line.product_id] = wanted.get(line.product_id, 0.0) + line.quantity
    products = {pid: _get_or_404(session, Product, pid, "Product") for pid in wanted}

    po = PurchaseOrder(supplier_id=supplier.id, status="Draft", reference=(body.reference or "").strip() or None,
                       notes=(body.notes or "").strip() or None, delivery_date=coerce_datetime(body.delivery_date),
                       date=datetime.utcnow(), created_by=user.id if user else None, total_amount=0.0)
    po.number = next_document_number(session, PurchaseOrder)
    session.add(po)
    session.flush()
    lines = []
    for pid, quantity in wanted.items():
        product = products[pid]
        description = product_label(product) + (f" ({product.packaging})" if product.packaging else "")  # code, name and pack for the supplier
        item = PurchaseOrderItem(purchase_order_id=po.id, product_id=pid, description=description, quantity=quantity, unit_price=0.0)
        price_line(session, item, default_price_field="cost")
        if product.cost is None:  # price_line falls back to the selling price - wrong on an order to a supplier
            item.unit_price, item.subtotal = 0.0, 0.0
        session.add(item)
        if product.supplier_id is None:
            product.supplier_id = supplier.id  # remembered: next time it is suggested for this supplier
            session.add(product)
        lines.append({"description": description, "quantity": quantity, "unit_price": item.unit_price})
    session.flush()
    _recalculate_total(session, po)
    session.commit()
    session.refresh(po)
    contact = {"id": supplier.id, "name": supplier.name, "email": supplier.email, "phone": supplier.phone,
               "contact_person": supplier.contact_person}  # plain values: the committed object would serialise empty
    return {"order": po, "supplier": contact, "lines": lines}


@router.post("/purchase-orders/{po_id}/mark-sent")
def mark_sent(po_id: int, session: Session = Depends(get_session)):
    """After an order has been emailed or WhatsApped: a Draft becomes Sent. Any other status is left alone."""
    po = _get_or_404(session, PurchaseOrder, po_id, "Purchase order")
    if po.status == "Draft":
        po.status = "Sent"
        session.add(po)
        session.commit()
    return {"status": po.status}


# --- Purchase orders ---

@router.get("/purchase-orders/", response_model=List[PurchaseOrder])
def read_purchase_orders(session: Session = Depends(get_session)):
    return session.exec(select(PurchaseOrder)).all()


@router.post("/purchase-orders/", response_model=PurchaseOrder)
def create_purchase_order(po: PurchaseOrder, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _get_or_404(session, Supplier, po.supplier_id, "Supplier")
    po.id = None
    po.date = coerce_datetime(po.date) or datetime.utcnow()
    po.delivery_date = coerce_datetime(po.delivery_date)
    po.number = next_document_number(session, PurchaseOrder)  # only ever assigned here - never taken from the request
    po.total_amount = 0.0  # set from the lines as they're added
    po.created_by = user.id if user else None
    session.add(po)
    session.commit()
    session.refresh(po)
    return po


@router.put("/purchase-orders/{po_id}", response_model=PurchaseOrder)
def update_purchase_order(po_id: int, data: PurchaseOrder, session: Session = Depends(get_session)):
    po = _get_or_404(session, PurchaseOrder, po_id, "Purchase order")
    changes = data.model_dump(exclude_unset=True, exclude={"id", "number", "total_amount", "created_by"})
    for key in ("date", "delivery_date"):
        if key in changes:
            changes[key] = coerce_datetime(changes[key])
    for key, value in changes.items():
        setattr(po, key, value)
    _recalculate_total(session, po)
    session.commit()
    session.refresh(po)
    return po


@router.delete("/purchase-orders/{po_id}", dependencies=[Depends(require_admin)])
@trash.recorded("purchase order", "purchaseorder")
def delete_purchase_order(po_id: int, session: Session = Depends(get_session)):
    po = _get_or_404(session, PurchaseOrder, po_id, "Purchase order")
    for item in session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).all():
        session.delete(item)
    stock.sync_purchase_order(session, po, deleted=True)
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
    pdf = generate_purchase_order_pdf(get_business(session), po, supplier, items, sales_rep_for(session, po))
    return StreamingResponse(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename={po.number or po_id}.pdf"
    })
