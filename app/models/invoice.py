from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime

class Invoice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    date: datetime = Field(default_factory=datetime.utcnow)
    total_amount: float = 0.0
    status: str = "unpaid" # unpaid, paid, cancelled
    notes: Optional[str] = None

class InvoiceItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    invoice_id: int = Field(foreign_key="invoice.id")
    product_id: int = Field(foreign_key="product.id")
    quantity: float
    unit_price: float
    subtotal: float
