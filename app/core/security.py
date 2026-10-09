import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.db import get_session
from app.models.user import User

# Regenerated every time the backend process starts. Access tokens only ever
# live in the renderer's memory for the current app session (never persisted
# to disk), so nothing needs this key to survive a restart - a fresh key per
# run just means any old token can't be replayed after a restart either.
_JWT_SECRET = secrets.token_urlsafe(48)
_JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_LIFETIME = timedelta(hours=12)
REMEMBER_TOKEN_LIFETIME = timedelta(days=45)
# A phone is easier to lose than the office PC, so its sessions are shorter:
# it asks for the PIN again sooner and a remembered phone is forgotten sooner.
PHONE_ACCESS_TOKEN_LIFETIME = timedelta(hours=6)
PHONE_REMEMBER_LIFETIME = timedelta(days=14)

# 5 wrong PIN guesses locks the remembered device out for 5 minutes and
# forces a full sign-in again - a 5-digit PIN only has 100,000 combinations,
# so this rate limit is what actually makes it safe.
MAX_PIN_ATTEMPTS = 5
PIN_LOCKOUT = timedelta(minutes=5)

_bearer_scheme = HTTPBearer(auto_error=False)


def hash_secret(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_secret(raw: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int, version: int = 0, phone: bool = False) -> str:
    """`version` is the user's token_version: changing a password or "sign out
    everywhere" raises it, which makes every token issued before it useless."""
    now = datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "v": int(version or 0),
        "exp": now + (PHONE_ACCESS_TOKEN_LIFETIME if phone else ACCESS_TOKEN_LIFETIME),
        "iat": now,
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> tuple:
    """(user id, token version)"""
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        return int(payload["sub"]), int(payload.get("v", 0))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please sign in again")


def generate_remember_token() -> str:
    return secrets.token_urlsafe(32)


def hash_remember_token(raw: str) -> str:
    # A plain, fast hash is fine (and preferred) here: unlike a password or
    # PIN, this raw value is a long random token an attacker can't feasibly
    # guess, so it doesn't need bcrypt's deliberate slowness.
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in required")
    user_id, version = decode_access_token(credentials.credentials)
    user = session.get(User, user_id)
    if not user or not user.is_active or (user.token_version or 0) != version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in required")
    return user


def require_settled_password(user: User = Depends(get_current_user)) -> User:
    """Signed in AND not still on a temporary password an admin set: every business route needs this (main.py), so
    a temporary password only opens the screen that replaces it - the /auth routes use get_current_user instead."""
    if user.must_change_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={
            "code": "password_change_required", "message": "Choose your own password first (Settings, or the sign-in screen)."})
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an admin can do this")
    return user
