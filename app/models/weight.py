from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class WeightLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    animal_id: int = Field(foreign_key="animal.id")
    date: datetime = Field(default_factory=datetime.utcnow)
    weight: float
    unit: str = "kg"
    notes: Optional[str] = None
