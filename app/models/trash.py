from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class TrashItem(SQLModel, table=True):
    """Something an admin deleted, kept for 30 days (app/core/trash.py). `payload` is JSON: every row the delete
    removed - the record and what went with it - so restoring puts all of it back."""
    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str  # invoice, client, product ...
    label: str  # what to call it in the list: the invoice number, the farm's name ...
    row_count: int = 1
    payload: str
    deleted_at: datetime = Field(default_factory=datetime.utcnow, index=True)
