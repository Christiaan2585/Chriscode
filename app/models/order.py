from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    quote_id: Optional[int] = Field(default=None, foreign_key="quote.id")
    date: datetime = Field(default_factory=datetime.utcnow)
    total_amount: float = 0.0
    status: str = "Pending" # Pending, Paid, Shipped
