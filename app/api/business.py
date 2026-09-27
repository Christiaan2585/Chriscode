from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.documents import document_totals, line_amounts, next_number
from app.core.security import require_admin
from app.models.business import BusinessSettings
from app.models.invoice import Invoice
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.models.quote import Quote

router = APIRouter(prefix="/business", tags=["Business settings"])

# Which setting fields drive each document type's numbering.
_NUMBERING = {
    Invoice: ("invoice_prefix", "invoice_start_number"),
    Quote: ("quote_prefix", "quote_start_number"),
    PurchaseOrder: ("po_prefix", "po_start_number"),
}


def get_business(session: Session) -> BusinessSettings:
    settings = session.get(BusinessSettings, 1)
    if settings is None:
        settings = BusinessSettings(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def next_document_number(session: Session, model) -> str:
    prefix_field, start_field = _NUMBERING[model]
    settings = get_business(session)
    used = session.exec(select(model.number).where(model.number.is_not(None))).all()
    return next_number(used, getattr(settings, prefix_field), getattr(settings, start_field))


def default_due_date(session: Session, date: datetime) -> datetime:
    return date + timedelta(days=get_business(session).payment_terms_days)


def default_expiry_date(session: Session, date: datetime) -> datetime:
    return date + timedelta(days=get_business(session).quote_valid_days)


def price_line(session: Session, item, default_price_field: str = "price") -> None:
    """Fill in an invoice/quote/PO line's unit price, VAT rate and inclusive
    subtotal. A price typed on the line wins; otherwise the product's price
    (excl. VAT when the business is VAT registered). VAT is frozen on the
    line so changing the settings later doesn't rewrite old paperwork."""
    settings = get_business(session)
    product = session.get(Product, item.product_id) if item.product_id else None
    if not item.unit_price and product is not None:
        price = getattr(product, default_price_field) or product.price
        if settings.vat_registered and default_price_field == "price":
            price = product.price_excl_vat or price / (1 + settings.vat_rate / 100)
        item.unit_price = round(price, 2)
    if item.vat_percent is None:
        item.vat_percent = settings.vat_rate if settings.vat_registered else 0.0
    item.subtotal = line_amounts(item.quantity, item.unit_price, item.discount_percent, item.vat_percent)["inclusive"]


def product_label(product: Product) -> str:
    """How a product reads on paperwork - "83096 - Z-Tag M4/F4 Green (10)", as in Sage."""
    return f"{product.code} - {product.name}" if product.code else product.name


def document_lines(session: Session, items) -> list:
    """Invoice/quote lines as the PDF prints them."""
    lines = []
    for item in items:
        product = session.get(Product, item.product_id) if item.product_id else None
        lines.append({
            "description": product_label(product) if product else getattr(item, "description", None) or "Unknown product",
            "quantity": item.quantity, "unit_price": item.unit_price,
            "discount_percent": item.discount_percent, "vat_percent": item.vat_percent,
        })
    return lines


def totals_for(items) -> dict:
    return document_totals(
        [line_amounts(i.quantity, i.unit_price, i.discount_percent, i.vat_percent) for i in items]
    )


_PREFIX = Field(min_length=1, max_length=10, pattern=r"^[A-Za-z0-9-]+$")


class BusinessSettingsUpdate(BaseModel):
    trading_name: str = Field(min_length=1, max_length=200)
    vat_registered: bool = False
    vat_number: str | None = Field(default=None, max_length=30)
    vat_rate: float = Field(default=15.0, ge=0, le=100)
    postal_address: str | None = Field(default=None, max_length=500)
    physical_address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=200)
    sales_rep: str | None = Field(default=None, max_length=100)
    sales_rep_phone: str | None = Field(default=None, max_length=50)
    bank_details: str | None = Field(default=None, max_length=500)
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    quote_valid_days: int = Field(default=30, ge=0, le=365)
    invoice_prefix: str = _PREFIX
    invoice_start_number: int = Field(default=1, ge=1, le=9_999_999)
    quote_prefix: str = _PREFIX
    quote_start_number: int = Field(default=1, ge=1, le=9_999_999)
    po_prefix: str = _PREFIX
    po_start_number: int = Field(default=1, ge=1, le=9_999_999)


def _with_next_numbers(session: Session, settings: BusinessSettings) -> dict:
    return {
        **settings.model_dump(),
        "next_invoice_number": next_document_number(session, Invoice),
        "next_quote_number": next_document_number(session, Quote),
        "next_po_number": next_document_number(session, PurchaseOrder),
    }


@router.get("/")
def read_business(session: Session = Depends(get_session)):
    return _with_next_numbers(session, get_business(session))


@router.put("/", dependencies=[Depends(require_admin)])
def update_business(data: BusinessSettingsUpdate, session: Session = Depends(get_session)):
    settings = get_business(session)
    for key, value in data.model_dump().items():
        setattr(settings, key, value.strip() if isinstance(value, str) else value)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return _with_next_numbers(session, settings)
