from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class RememberToken(SQLModel, table=True):
    """A 'this device remembers you' token. The raw token is only ever
    returned to the client once, at creation time - only its hash is stored
    here, so a stolen database backup can't be replayed as a login.

    Getting past this token alone is NOT enough to use the app: the holder
    still has to enter the account's 5-digit PIN (see failed_pin_attempts /
    locked_until below), which is the actual gate on each app open."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    token_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    last_used_at: Optional[datetime] = None
    failed_pin_attempts: int = 0
    locked_until: Optional[datetime] = None
