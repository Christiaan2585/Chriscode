from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class Appointment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    animal_id: Optional[int] = Field(default=None, foreign_key="animal.id")
    date: datetime
    time: str
    reason: str
    status: str = "scheduled" # e.g., scheduled, completed, cancelled
    created_at: datetime = Field(default_factory=datetime.utcnow)
