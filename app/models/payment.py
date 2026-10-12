from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Payment(SQLModel, table=True):
    """Money received against an invoice. An invoice's balance is its total minus its payments and credit notes;
    its paid/unpaid status follows from that (app/core/settlement.py)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    invoice_id: int = Field(foreign_key="invoice.id", index=True)
    client_id: int = Field(foreign_key="client.id", index=True)
    amount: float
    date: datetime = Field(default_factory=datetime.utcnow)
    method: str = "EFT"  # EFT, Cash, Card, Other
    reference: Optional[str] = None
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CreditNote(SQLModel, table=True):
    """A (part) reversal of an invoice - returned or damaged goods, a price correction. Numbered CRN0000001, never
    edited; it lowers the invoice's balance, and a credit on a paid invoice means the client is owed that amount."""
    id: Optional[int] = Field(default=None, primary_key=True)
    number: str = Field(index=True)
    invoice_id: int = Field(foreign_key="invoice.id", index=True)
    client_id: int = Field(foreign_key="client.id", index=True)
    date: datetime = Field(default_factory=datetime.utcnow)
    amount: float  # incl. VAT
    vat_amount: float = 0.0  # the VAT part, in the same proportion as on the invoice
    reason: str
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
