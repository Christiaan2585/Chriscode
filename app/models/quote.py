from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
from .quote_item import QuoteItem

class Quote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    date: datetime = Field(default_factory=datetime.utcnow)
    total_amount: float = 0.0
    status: str = "Draft" # Draft, Sent, Accepted
    number: Optional[str] = Field(default=None, index=True)  # QUO0000001
    reference: Optional[str] = None
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None

    items: List[QuoteItem] = Relationship(back_populates="quote")
