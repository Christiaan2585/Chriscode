from sqlmodel import SQLModel, Field, Relationship
from typing import Optional


class QuoteItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    quote_id: Optional[int] = Field(default=None, foreign_key="quote.id")
    product_id: int = Field(foreign_key="product.id")
    quantity: float
    unit_price: float
    subtotal: float = 0.0  # the line's inclusive total (after discount, plus VAT)
    discount_percent: Optional[float] = None
    vat_percent: Optional[float] = None
    program_step_id: Optional[int] = None  # the herding program step this line is for (a program quote)

    quote: Optional["Quote"] = Relationship(back_populates="items")
