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


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + ACCESS_TOKEN_LIFETIME,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> int:
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please sign in again")
    return int(payload["sub"])


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
    user_id = decode_access_token(credentials.credentials)
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in required")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an admin can do this")
    return user
