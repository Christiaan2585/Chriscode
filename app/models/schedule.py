from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class HealthSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    animal_id: int = Field(foreign_key="animal.id")
    treatment_name: str
    last_date: datetime
    frequency_days: int # How often this is needed (e.g., 180 for 6 months)
    notes: Optional[str] = None
