from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class AuditEntry(SQLModel, table=True):
    """One line of the activity log (Settings -> Activity log, admins only):
    who did what, when. Only the what - never the data itself (no request
    bodies, passwords or amounts) - so the log is safe to read and to keep."""
    id: Optional[int] = Field(default=None, primary_key=True)
    at: datetime = Field(default_factory=datetime.utcnow, index=True)
    user_id: Optional[int] = Field(default=None, index=True)
    user_name: Optional[str] = None  # kept as text, so the entry still reads right after the account is gone
    action: str  # "Deleted client", "Signed in", "Account locked"...
    entity: Optional[str] = Field(default=None, index=True)
    entity_id: Optional[str] = None
    summary: Optional[str] = None
    result: str = "ok"  # "ok", "refused" (403/409) or "failed"
    via: str = "pc"  # "pc" or "phone"
