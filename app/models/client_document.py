from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ClientDocument(SQLModel, table=True):
    """A file kept on a client's page - for now their tax certificate (`kind`
    "tax_certificate"; one per client, replaced when a new one is loaded).
    Stored in the database so it's in every backup and restore. `data` is
    never listed in the Excel export (see app/core/export.py)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id", index=True)
    kind: str = Field(index=True)
    filename: str
    content_type: str
    size: int
    data: bytes
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
