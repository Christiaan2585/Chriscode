from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class MedicalRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    animal_id: int = Field(foreign_key="animal.id")
    date: datetime = Field(default_factory=datetime.utcnow)
    diagnosis: str
    treatment: Optional[str] = None
    medication: Optional[str] = None
    vet_name: Optional[str] = None
    notes: Optional[str] = None
