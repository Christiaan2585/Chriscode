from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime

class ProgramAssignment(SQLModel, table=True):
    animal_id: int = Field(foreign_key="animal.id", primary_key=True)
    program_id: int = Field(foreign_key="herdingprogram.id", primary_key=True)
    assigned_at: datetime = Field(default_factory=datetime.utcnow)

class HerdingProgram(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    goal: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
