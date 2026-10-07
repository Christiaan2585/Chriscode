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
    phone: Optional[str] = None  # printed as the sales rep's number on documents they create
    pin_hash: Optional[str] = None
    is_admin: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None
    # Password sign-in limit (2026-09-29, before phones could reach the
    # backend): see auth.MAX_LOGIN_ATTEMPTS. NULL on older rows = 0 / unlocked.
    failed_login_attempts: Optional[int] = 0
    login_locked_until: Optional[datetime] = None
    # Hardening (2026-10-07). All optional so the schema sync can add them.
    lockout_count: Optional[int] = 0  # how many times the account has been locked in a row: each lock lasts longer
    token_version: Optional[int] = 0  # raised to sign the user out everywhere (see security.create_access_token)
    password_changed_at: Optional[datetime] = None
    must_change_password: Optional[bool] = False  # set when an admin resets the password
    totp_secret: Optional[str] = None  # authenticator-app secret (two-step sign-in)
    totp_enabled: Optional[bool] = False
    totp_last_step: Optional[int] = None  # the last 30-second code step used, so a code can't be replayed


class RecoveryCode(SQLModel, table=True):
    """One of a user's eight one-time two-step recovery codes. Only a hash is
    kept; the codes are shown once, when two-step sign-in is turned on."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    code_hash: str = Field(index=True)
    used_at: Optional[datetime] = None


class UserPhoto(SQLModel, table=True):
    """A user's own profile photo (2026-09-29), kept apart from User so the
    user row stays light. Already a small square JPEG - see
    app/core/images.py's process_avatar. Shown instead of avatar_url (the
    Google picture) when there is one."""
    user_id: int = Field(primary_key=True, foreign_key="user.id")
    image: bytes
    updated_at: datetime = Field(default_factory=datetime.utcnow)
