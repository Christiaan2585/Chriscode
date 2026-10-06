from typing import Optional

from sqlmodel import Field, SQLModel


class CatalogueLink(SQLModel, table=True):
    """Which of this app's products (pack sizes) belong to a product in the
    supplier's catalogue book (see app/core/kyron_catalogue.py). `entry_key`
    is the English index name, normalised, so the link survives a new
    edition of the book with the product on a different page."""
    id: Optional[int] = Field(default=None, primary_key=True)
    entry_key: str = Field(index=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    sort_order: int = 0
