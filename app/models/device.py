from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class PairedDevice(SQLModel, table=True):
    """A phone paired with this PC (Settings -> Phones). Every request that
    comes in over the office network must carry its token - see
    app/core/lan.py's DeviceGuard. Only a SHA-256 of the token is kept, and
    removing the row locks that phone out at once."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    token_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen_at: Optional[datetime] = None
