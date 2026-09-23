from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime

class Client(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    farm_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
