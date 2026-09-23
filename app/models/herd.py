from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime

class Herd(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    client_id: int = Field(foreign_key="client.id")

    # Relationship to Animals - will be a link table if many-to-many
    # For simplicity, let's assume an animal belongs to one herd (Many-to-One)
    # If many-to-many is needed, we'd need a HerdAnimal link table.
    # I'll implement Many-to-One for now (Animal -> Herd).
