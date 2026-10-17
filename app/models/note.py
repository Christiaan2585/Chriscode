from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class ClientNote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    content: str
    reminder_date: Optional[datetime] = None
    is_completed: bool = False
    kind: Optional[str] = None  # "call" for a call-log entry, blank for an ordinary note
    author: Optional[str] = None  # who wrote it (kept as text, so it still reads right after the account is gone)
    created_at: datetime = Field(default_factory=datetime.utcnow)
