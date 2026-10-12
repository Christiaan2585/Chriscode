"""Stock on the shelf. A count sets a product's number; after that a received purchase order adds and an invoice
takes off. Every change is a StockMovement, and each document's movements carry its `source` ("invoice:12",
"po:3"), so `sync` books only the difference whenever a document changes - editing, cancelling, un-cancelling and
deleting all come out right without each route knowing the rules.

Movements are written for every product, counted or not; the number on the shelf only moves once a product has
been counted (stock_quantity not None). Selling more than is counted goes below zero instead of blocking the sale -
the count was wrong, not the invoice."""
from collections import defaultdict
from typing import Optional

from sqlmodel import Session, func, select

from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product, StockMovement
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem


def _move(session: Session, product: Product, change: float, reason: str, source: Optional[str] = None,
          reference: Optional[str] = None, user_id: Optional[int] = None) -> None:
    if not change:
        return
    session.add(StockMovement(product_id=product.id, change=change, reason=reason, source=source,
                              reference=reference, created_by=user_id))
    if product.stock_quantity is not None:
        product.stock_quantity = round(product.stock_quantity + change, 3)
        product.in_stock = product.stock_quantity > 0
        session.add(product)


def count(session: Session, product: Product, quantity: float, user_id: Optional[int] = None) -> None:
    """What is on the shelf now. The first count switches tracking on."""
    before = product.stock_quantity or 0.0
    if product.stock_quantity is None:
        product.stock_quantity = 0.0
    _move(session, product, round(quantity - before, 3), "count", user_id=user_id)
    product.in_stock = quantity > 0
    session.add(product)


def _booked(session: Session, source: str) -> dict:
    rows = session.exec(select(StockMovement.product_id, func.sum(StockMovement.change))
                        .where(StockMovement.source == source).group_by(StockMovement.product_id)).all()
    return {product_id: total for product_id, total in rows}


def _sync(session: Session, source: str, wanted: dict, reason: str, reference: Optional[str]) -> None:
    booked = _booked(session, source)
    for product_id in set(wanted) | set(booked):
        change = round(wanted.get(product_id, 0.0) - booked.get(product_id, 0.0), 3)
        product = session.get(Product, product_id)
        if change and product is not None:
            _move(session, product, change, reason, source, reference)


def _lines(items) -> dict:
    out = defaultdict(float)
    for item in items:
        if item.product_id:
            out[item.product_id] += item.quantity or 0.0
    return out


def sync_invoice(session: Session, invoice: Invoice, deleted: bool = False) -> None:
    """Stock follows the invoice's lines; a cancelled or deleted invoice takes nothing."""
    session.flush()
    items = session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
    wanted = {} if deleted or invoice.status == "cancelled" else {k: -v for k, v in _lines(items).items()}
    _sync(session, f"invoice:{invoice.id}", wanted, "sold", invoice.number)


def sync_purchase_order(session: Session, po: PurchaseOrder, deleted: bool = False) -> None:
    """Only a Received order adds stock."""
    session.flush()
    items = session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    wanted = _lines(items) if po.status == "Received" and not deleted else {}
    _sync(session, f"po:{po.id}", wanted, "received", po.number)


def book_existing_paperwork(session: Session) -> None:
    """Once, at the first start with stock tracking: record what invoices and received orders from before already
    moved, without changing any count - so editing an old invoice later books only the change."""
    if session.exec(select(StockMovement.id).limit(1)).first() is not None:
        return
    for invoice in session.exec(select(Invoice).where(Invoice.status != "cancelled")).all():
        items = session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
        for product_id, qty in _lines(items).items():
            session.add(StockMovement(product_id=product_id, change=-qty, reason="opening", source=f"invoice:{invoice.id}",
                                      reference=invoice.number))
    for po in session.exec(select(PurchaseOrder).where(PurchaseOrder.status == "Received")).all():
        items = session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
        for product_id, qty in _lines(items).items():
            session.add(StockMovement(product_id=product_id, change=qty, reason="opening", source=f"po:{po.id}", reference=po.number))
    session.commit()
