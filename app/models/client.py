from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime

class Client(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None  # physical address
    postal_address: Optional[str] = None
    vat_number: Optional[str] = None
    farm_name: Optional[str] = None
    # When this client was given the standard herding program (or already had a
    # program). Set once, so deleting a client's program doesn't bring it back.
    standard_program_at: Optional[datetime] = None
    erased_at: Optional[datetime] = None  # personal details erased on request (see api/clients.erase_client_personal_data)
    created_at: datetime = Field(default_factory=datetime.utcnow)
