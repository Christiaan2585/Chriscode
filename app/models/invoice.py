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
    # Added 2026-09-27 for Sage-style invoices. Optional/blank on invoices made
    # before then (the schema sync adds columns without back-filling).
    number: Optional[str] = Field(default=None, index=True)  # INV0000181 - fixed once assigned
    reference: Optional[str] = None
    due_date: Optional[datetime] = None

class InvoiceItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    invoice_id: int = Field(foreign_key="invoice.id")
    product_id: int = Field(foreign_key="product.id")
    quantity: float
    unit_price: float  # excl. VAT when the business is VAT registered
    subtotal: float  # the line's inclusive total (after discount, plus VAT)
    discount_percent: Optional[float] = None
    vat_percent: Optional[float] = None  # frozen when the line is added
