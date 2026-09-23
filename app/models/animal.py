from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime

class Animal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    herd_id: Optional[int] = Field(default=None, foreign_key="herd.id")
    name: str
    species: str # Dropdown: Goats, Sheep, Cows, Horses, etc.
    age_group: str = "Adult" # Dropdown: Young, Adult
    breed: Optional[str] = None
    birth_date: Optional[datetime] = None
    gender: Optional[str] = None
    tag_id: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
