import re
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.google_oauth import exchange_code_for_profile, get_google_client_id, is_google_login_enabled
from app.core.security import (
    MAX_PIN_ATTEMPTS,
    PIN_LOCKOUT,
    REMEMBER_TOKEN_LIFETIME,
    create_access_token,
    generate_remember_token,
    get_current_user,
    hash_remember_token,
    hash_secret,
    require_admin,
    verify_secret,
)
from app.models.remember_token import RememberToken
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Auth"])

_PIN_PATTERN = re.compile(r"^\d{5}$")


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    avatar_url: Optional[str] = None
    is_admin: bool
    has_pin: bool

    @staticmethod
    def from_user(user: User) -> "UserOut":
        return UserOut(
            id=user.id,
            name=user.name,
            email=user.email,
            avatar_url=user.avatar_url,
            is_admin=user.is_admin,
            has_pin=bool(user.pin_hash),
        )


class AuthResult(BaseModel):
    access_token: str
    remember_token: str
    user: UserOut


class SetupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleCallbackRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str
    # Generated per sign-in attempt in desktop-app/index.js and embedded by
    # Google into the id_token it issues - checked in exchange_code_for_profile
    # so a captured id_token from an earlier sign-in can't be replayed here.
    nonce: str


class PinSetupRequest(BaseModel):
    pin: str


class PinVerifyRequest(BaseModel):
    remember_token: str
    pin: str


class AddUserRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    is_admin: bool = False


def _issue_auth_result(user: User, session: Session) -> AuthResult:
    user.last_login_at = datetime.utcnow()
    session.add(user)

    raw_remember_token = generate_remember_token()
    remember = RememberToken(
        user_id=user.id,
        token_hash=hash_remember_token(raw_remember_token),
        expires_at=datetime.utcnow() + REMEMBER_TOKEN_LIFETIME,
    )
    session.add(remember)
    session.commit()

    return AuthResult(
        access_token=create_access_token(user.id),
        remember_token=raw_remember_token,
        user=UserOut.from_user(user),
    )


@router.get("/status")
def auth_status(session: Session = Depends(get_session)):
    """Tells the frontend whether this is a brand-new install (no accounts
    yet, show 'create the first account') and whether Google sign-in has
    been configured (show or hide the Google button)."""
    has_users = session.exec(select(User.id).limit(1)).first() is not None
    return {
        "setup_required": not has_users,
        "google_enabled": is_google_login_enabled(),
        "google_client_id": get_google_client_id() if is_google_login_enabled() else None,
    }


@router.post("/setup", response_model=AuthResult)
def setup_first_account(payload: SetupRequest, session: Session = Depends(get_session)):
    """Creates the very first (admin) account. Only works while the user
    table is empty - after that, new staff accounts must be added by an
    existing admin via POST /auth/users."""
    existing = session.exec(select(User.id).limit(1)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup has already been completed")

    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_secret(payload.password),
        is_admin=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _issue_auth_result(user, session)


@router.post("/login", response_model=AuthResult)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == payload.email.lower())).first()
    if not user or not user.is_active or not verify_secret(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    return _issue_auth_result(user, session)


@router.post("/google/callback", response_model=AuthResult)
def google_callback(payload: GoogleCallbackRequest, session: Session = Depends(get_session)):
    try:
        profile = exchange_code_for_profile(payload.code, payload.code_verifier, payload.redirect_uri, payload.nonce)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    user = session.exec(select(User).where(User.google_sub == profile["sub"])).first()
    if user is None:
        # Not linked yet - fall back to matching by email so someone who
        # already has a password account can start using Google sign-in
        # without an admin having to do anything.
        user = session.exec(select(User).where(User.email == profile["email"].lower())).first()

    no_users_yet = session.exec(select(User.id).limit(1)).first() is None

    if user is None and no_users_yet:
        user = User(name=profile["name"], email=profile["email"].lower(), is_admin=True)
        session.add(user)
    elif user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No account here is linked to this Google account. Ask an admin to add you first.",
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")

    user.google_sub = profile["sub"]
    user.avatar_url = profile.get("picture")
    session.add(user)
    session.commit()
    session.refresh(user)
    return _issue_auth_result(user, session)


@router.post("/pin/setup")
def setup_pin(payload: PinSetupRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    if not _PIN_PATTERN.match(payload.pin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN must be exactly 5 digits")
    user.pin_hash = hash_secret(payload.pin)
    session.add(user)
    session.commit()
    return {"ok": True}


@router.post("/pin/verify", response_model=AuthResult)
def verify_pin(payload: PinVerifyRequest, session: Session = Depends(get_session)):
    token_hash = hash_remember_token(payload.remember_token)
    remember = session.exec(select(RememberToken).where(RememberToken.token_hash == token_hash)).first()
    if not remember or remember.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again")

    if remember.locked_until and remember.locked_until > datetime.utcnow():
        wait_seconds = int((remember.locked_until - datetime.utcnow()).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many incorrect PIN attempts. Try again in {max(wait_seconds, 1)}s, or sign in again.",
        )

    user = session.get(User, remember.user_id)
    if not user or not user.is_active or not verify_secret(payload.pin, user.pin_hash):
        remember.failed_pin_attempts += 1
        if remember.failed_pin_attempts >= MAX_PIN_ATTEMPTS:
            remember.locked_until = datetime.utcnow() + PIN_LOCKOUT
            remember.failed_pin_attempts = 0
        session.add(remember)
        session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect PIN")

    remember.failed_pin_attempts = 0
    remember.locked_until = None
    remember.last_used_at = datetime.utcnow()
    remember.expires_at = datetime.utcnow() + REMEMBER_TOKEN_LIFETIME
    session.add(remember)
    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()

    return AuthResult(
        access_token=create_access_token(user.id),
        remember_token=payload.remember_token,
        user=UserOut.from_user(user),
    )


class ForgetDeviceRequest(BaseModel):
    remember_token: str


@router.post("/forget-device")
def forget_device(payload: ForgetDeviceRequest, session: Session = Depends(get_session)):
    """Invalidates this device's remember token (e.g. user chose 'sign out
    completely' or 'not you' on a shared PC)."""
    token_hash = hash_remember_token(payload.remember_token)
    remember = session.exec(select(RememberToken).where(RememberToken.token_hash == token_hash)).first()
    if remember:
        session.delete(remember)
        session.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.from_user(user)


@router.get("/users", response_model=List[UserOut])
def list_users(_: User = Depends(require_admin), session: Session = Depends(get_session)):
    users = session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
    return [UserOut.from_user(u) for u in users]


@router.post("/users", response_model=UserOut)
def add_user(payload: AddUserRequest, _: User = Depends(require_admin), session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email.lower())).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with that email already exists")
    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_secret(payload.password),
        is_admin=payload.is_admin,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut.from_user(user)


@router.delete("/users/{user_id}")
def deactivate_user(user_id: int, admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't deactivate your own account")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = False
    session.add(user)
    session.commit()
    return {"ok": True}
