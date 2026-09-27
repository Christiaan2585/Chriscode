from sqlmodel import SQLModel, Field
from typing import Optional


class BusinessSettings(SQLModel, table=True):
    """The one row (id 1) of business details printed on invoices, quotes and
    purchase orders. Lives in the database, not in code - bank details must
    never end up in the (public) repo."""
    id: Optional[int] = Field(default=1, primary_key=True)
    trading_name: str = "Sandveld Vee Dienste"
    registration_number: Optional[str] = None  # company / CK registration
    vat_registered: bool = False
    vat_number: Optional[str] = None
    vat_rate: float = 15.0
    postal_address: Optional[str] = None
    physical_address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    # Printed only on documents with no creator (made before per-user profiles).
    sales_rep: Optional[str] = None
    sales_rep_phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None
    bank_account_type: Optional[str] = None
    payment_note: Optional[str] = None  # e.g. "Use the invoice number as reference"
    payment_terms_days: int = 30
    quote_valid_days: int = 30
    invoice_prefix: str = "INV"
    invoice_start_number: int = 1
    quote_prefix: str = "QUO"
    quote_start_number: int = 1
    po_prefix: str = "PO"
    po_start_number: int = 1
