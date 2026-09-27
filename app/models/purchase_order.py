from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class Supplier(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    vat_number: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PurchaseOrder(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    supplier_id: int = Field(foreign_key="supplier.id")
    number: Optional[str] = Field(default=None, index=True)  # PO0000026
    date: datetime = Field(default_factory=datetime.utcnow)
    delivery_date: Optional[datetime] = None
    reference: Optional[str] = None
    notes: Optional[str] = None  # e.g. a delivery address for this order
    status: str = "Draft"  # Draft, Sent, Received, Cancelled
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")  # the sales rep printed on it
    total_amount: float = 0.0


class PurchaseOrderItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    purchase_order_id: int = Field(foreign_key="purchaseorder.id")
    product_id: Optional[int] = Field(default=None, foreign_key="product.id")
    # Printed as-is, so the order still reads correctly if the product is
    # renamed later.
    description: str
    quantity: float
    unit_price: float  # cost price, excl. VAT when the business is VAT registered
    discount_percent: Optional[float] = None
    vat_percent: Optional[float] = None
    subtotal: float = 0.0  # inclusive line total
