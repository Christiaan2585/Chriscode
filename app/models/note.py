from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class ClientNote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    content: str
    reminder_date: Optional[datetime] = None
    is_completed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
