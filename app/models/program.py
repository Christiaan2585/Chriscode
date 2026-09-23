from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime

class ProgramAssignment(SQLModel, table=True):
    # Legacy: links an individually-registered Animal to a program. Kept so
    # the old standalone (no-longer-in-nav) Herding Programs page still
    # works, but new programs use AnimalGroup below instead - a headcount
    # by type, not a link to specific Animal rows.
    animal_id: int = Field(foreign_key="animal.id", primary_key=True)
    program_id: int = Field(foreign_key="herdingprogram.id", primary_key=True)
    assigned_at: datetime = Field(default_factory=datetime.utcnow)

class AnimalGroup(SQLModel, table=True):
    """A headcount-based group within a herding program, e.g. "12 Goats" -
    defined by animal type + group size rather than a link to individually
    registered Animal records."""
    id: Optional[int] = Field(default=None, primary_key=True)
    program_id: int = Field(foreign_key="herdingprogram.id")
    animal_type: str
    group_size: int

class HerdingProgram(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    goal: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    description: Optional[str] = None
    # Programs are now created directly from a client's page and scoped to
    # that client. Optional (nullable) so the auto column-sync in db.py can
    # add it to the existing table, and so any pre-existing rows from
    # before this field existed still load fine.
    client_id: Optional[int] = Field(default=None, foreign_key="client.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
