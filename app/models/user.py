from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True, unique=True)
    password_hash: Optional[str] = None
    google_sub: Optional[str] = Field(default=None, index=True, unique=True)
    avatar_url: Optional[str] = None
    pin_hash: Optional[str] = None
    is_admin: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None
