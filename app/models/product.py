from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    price: float
    unit: str = "unit"
    dosage: float = 0.0  # Added this field
    description: Optional[str] = None

    # --- Added for supplier price-list imports (e.g. pryslyse.xlsx) ---
    code: Optional[str] = Field(default=None, index=True)  # supplier product code (numbers or text like "PROMO06")
    pack_size: Optional[float] = None  # unit pack size in ml/gr, as given by the supplier
    packaging: Optional[str] = None  # e.g. "10 x 100 ml" - free text carton/shipping description
    category: Optional[str] = None  # e.g. "Entstowwe / Vaccines", "Doseermiddels" - from the price list section
    cost: Optional[float] = None  # supplier "Unit Price" excl VAT - the base cost, before markup
    price_excl_vat: Optional[float] = None  # selling price excl VAT (cost x 1.25)


class ProductImage(SQLModel, table=True):
    """A product's picture, kept apart from Product so the product list stays
    light. Stored already shrunk (see app/core/images.py) so the database -
    and every daily backup of it - stays small."""
    product_id: int = Field(primary_key=True, foreign_key="product.id")
    image: bytes  # JPEG, at most 800px on the long side
    thumbnail: bytes  # JPEG, at most 160px
    updated_at: datetime = Field(default_factory=datetime.utcnow)
