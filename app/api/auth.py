import base64
import hashlib
import re
import secrets
import threading
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.core import audit, password_policy, totp
from app.core.db import get_session
from app.core.google_oauth import exchange_code_for_profile, get_google_client_id, is_google_login_enabled
from app.core.security import (
    MAX_PIN_ATTEMPTS,
    PHONE_REMEMBER_LIFETIME,
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
from app.core.images import NotAnImage, process_avatar
from app.models.remember_token import RememberToken
from app.models.user import RecoveryCode, User, UserPhoto

router = APIRouter(prefix="/auth", tags=["Auth"])

_PIN_PATTERN = re.compile(r"^\d{5}$")


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    is_admin: bool
    has_pin: bool
    two_step_enabled: bool = False
    must_change_password: bool = False
    locked: bool = False  # too many wrong tries; an admin can unlock

    @staticmethod
    def from_user(user: User, session: Session) -> "UserOut":
        # An uploaded photo wins over the Google picture. It's sent inline (a
        # ~20 KB data URL) so the lock screen can keep showing it from the
        # device's remembered details, before anyone has signed in.
        photo = session.get(UserPhoto, user.id)
        return UserOut(
            id=user.id,
            name=user.name,
            email=user.email,
            avatar_url="data:image/jpeg;base64," + base64.b64encode(photo.image).decode() if photo else user.avatar_url,
            phone=user.phone,
            is_admin=user.is_admin,
            has_pin=bool(user.pin_hash),
            two_step_enabled=bool(user.totp_enabled),
            must_change_password=bool(user.must_change_password),
            locked=bool(user.login_locked_until and user.login_locked_until > datetime.utcnow()),
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
    code: Optional[str] = None  # the authenticator app's 6 digits (or a recovery code), once two-step sign-in is on


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


def _on_phone(request: Optional[Request]) -> bool:
    return bool(request is not None and getattr(request.state, "via_lan", False))


def _issue_auth_result(user: User, session: Session, phone: bool = False) -> AuthResult:
    user.last_login_at = datetime.utcnow()
    session.add(user)

    raw_remember_token = generate_remember_token()
    remember = RememberToken(
        user_id=user.id,
        token_hash=hash_remember_token(raw_remember_token),
        expires_at=datetime.utcnow() + (PHONE_REMEMBER_LIFETIME if phone else REMEMBER_TOKEN_LIFETIME),
    )
    session.add(remember)
    session.commit()

    return AuthResult(
        access_token=create_access_token(user.id, user.token_version or 0, phone=phone),
        remember_token=raw_remember_token,
        user=UserOut.from_user(user, session),
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

    password_policy.require(payload.password, payload.email, payload.name)
    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_secret(payload.password),
        is_admin=True,
        password_changed_at=datetime.utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _issue_auth_result(user, session)


# Password guessing limit. Five wrong tries lock the account, and each lock in a
# row lasts longer (15 minutes, an hour, four hours, a day) until someone signs in
# properly. An email that isn't an account is counted and locked exactly the same
# way, so the replies never give away which emails have accounts. The two-step
# code and the "current password" box when changing a password count too.
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT = timedelta(minutes=15)  # the first lock
LOCKOUT_STEPS = (LOGIN_LOCKOUT, timedelta(hours=1), timedelta(hours=4), timedelta(hours=24))


def _utcnow() -> datetime:
    return datetime.utcnow()


class _LoginThrottle:
    """Tries for emails that aren't accounts (accounts keep theirs on the user row)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._rows = {}

    def get(self, email: str):
        with self._lock:
            return self._rows.setdefault(email, SimpleNamespace(failed_login_attempts=0, lockout_count=0, login_locked_until=None))

    def clear(self):
        with self._lock:
            self._rows.clear()


THROTTLE = _LoginThrottle()


def _gate(session: Session, email: str, user: Optional[User]):
    """Whatever holds the try-counter for this sign-in: the user, or a stand-in for an unknown email."""
    return user if user is not None else THROTTLE.get(email.lower())


def _save_gate(session: Session, gate) -> None:
    if isinstance(gate, User):
        session.add(gate)
        session.commit()


def _refuse_if_locked(gate, now: datetime) -> None:
    if gate.login_locked_until and gate.login_locked_until > now:
        minutes = max(1, int((gate.login_locked_until - now).total_seconds() // 60) + 1)
        shown = f"{minutes} minutes" if minutes < 120 else f"{round(minutes / 60)} hours"
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"Too many wrong tries - this account is locked. Try again in {shown}, or ask an admin to unlock it.")


def _count_failure(session: Session, gate, now: datetime, what: str) -> HTTPException:
    """Adds one wrong try; the 5th locks. Returns the 401 to raise, which says how many tries are left."""
    gate.failed_login_attempts = (gate.failed_login_attempts or 0) + 1
    if gate.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
        step = LOCKOUT_STEPS[min(gate.lockout_count or 0, len(LOCKOUT_STEPS) - 1)]
        gate.login_locked_until = now + step
        gate.lockout_count = (gate.lockout_count or 0) + 1
        gate.failed_login_attempts = 0
        _save_gate(session, gate)
        minutes = int(step.total_seconds() // 60)
        shown = f"{minutes} minutes" if minutes < 120 else f"{minutes // 60} hours"
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"{what} - that was the last try, the account is now locked for {shown}")
    _save_gate(session, gate)
    left = MAX_LOGIN_ATTEMPTS - gate.failed_login_attempts
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"{what} - {left} {'try' if left == 1 else 'tries'} left")


def _clear_gate(session: Session, gate) -> None:
    gate.failed_login_attempts = 0
    gate.lockout_count = 0
    gate.login_locked_until = None
    _save_gate(session, gate)


def _hash_recovery(code: str) -> str:
    # Recovery codes are long random values, so a fast hash is right (as for remember tokens).
    return hashlib.sha256(re.sub(r"[^A-Za-z0-9]", "", code or "").upper().encode("utf-8")).hexdigest()


def _new_recovery_codes(user: User, session: Session) -> List[str]:
    for row in session.exec(select(RecoveryCode).where(RecoveryCode.user_id == user.id)).all():
        session.delete(row)
    codes = []
    for _ in range(8):
        raw = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
        session.add(RecoveryCode(user_id=user.id, code_hash=_hash_recovery(raw)))
    return codes


def _accept_second_step(user: User, code: Optional[str], session: Session) -> bool:
    """True when `code` is a fresh authenticator code or an unused recovery code (which it then spends)."""
    step = totp.verify(user.totp_secret, code, after_step=user.totp_last_step)
    if step is not None:
        user.totp_last_step = step
        return True
    digest = _hash_recovery(code)
    row = session.exec(select(RecoveryCode).where(RecoveryCode.user_id == user.id, RecoveryCode.code_hash == digest,
                                                  RecoveryCode.used_at.is_(None))).first()
    if row is not None:
        row.used_at = datetime.utcnow()
        session.add(row)
        return True
    return False


@router.post("/login", response_model=AuthResult)
def login(payload: LoginRequest, request: Request = None, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == payload.email.lower())).first()
    now = _utcnow()
    gate = _gate(session, payload.email, user)
    _refuse_if_locked(gate, now)
    via = "phone" if _on_phone(request) else "pc"

    def failed(what: str) -> HTTPException:
        error = _count_failure(session, gate, now, what)
        locked = bool(gate.login_locked_until and gate.login_locked_until > now)
        audit.record(session, user, "Account locked" if locked else "Failed sign-in", summary=payload.email.lower(),
                     result="failed", via=via)
        return error

    if not user or not user.is_active or not verify_secret(payload.password, user.password_hash):
        raise failed("Incorrect email or password")
    if user.totp_enabled:
        if not payload.code:  # password was right; only the second step is missing - not a wrong try
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={
                "code": "two_step_required",
                "message": "Enter the 6-digit code from your authenticator app (or one of your recovery codes)."})
        if not _accept_second_step(user, payload.code, session):
            raise failed("That code isn't right")
    _clear_gate(session, gate)
    result = _issue_auth_result(user, session, phone=_on_phone(request))
    audit.record(session, user, "Signed in", via=via)
    return result


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
def verify_pin(payload: PinVerifyRequest, request: Request = None, session: Session = Depends(get_session)):
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
    remember.expires_at = datetime.utcnow() + (PHONE_REMEMBER_LIFETIME if _on_phone(request) else REMEMBER_TOKEN_LIFETIME)
    session.add(remember)
    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()

    return AuthResult(
        access_token=create_access_token(user.id, user.token_version or 0, phone=_on_phone(request)),
        remember_token=payload.remember_token,
        user=UserOut.from_user(user, session),
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
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return UserOut.from_user(user, session)


class ProfileUpdate(BaseModel):
    name: str = Field(max_length=100)
    phone: Optional[str] = Field(default=None, max_length=50)


@router.put("/me", response_model=UserOut)
def update_me(payload: ProfileUpdate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """A user's own name and phone - printed as the sales rep on what they
    create. The email is the sign-in identity, so it isn't editable here."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name can't be blank")
    user.name = name
    user.phone = (payload.phone or "").strip() or None
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut.from_user(user, session)


MAX_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024  # phone photos are a few MB


@router.put("/me/photo", response_model=UserOut)
async def upload_my_photo(file: UploadFile = File(...), user: User = Depends(get_current_user),
                          session: Session = Depends(get_session)):
    """The signed-in user's own profile photo, stored as a small square JPEG
    (re-encoding also drops EXIF data such as GPS location)."""
    data = await file.read(MAX_PHOTO_UPLOAD_BYTES + 1)
    if len(data) > MAX_PHOTO_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That photo is over 10 MB - please use a smaller one")
    try:
        image = process_avatar(data)
    except NotAnImage:
        raise HTTPException(status_code=422, detail="That file isn't a picture this app can read (use JPG, PNG or WEBP)")
    row = session.get(UserPhoto, user.id) or UserPhoto(user_id=user.id, image=b"")
    row.image, row.updated_at = image, datetime.utcnow()
    session.add(row)
    session.commit()
    return UserOut.from_user(user, session)


@router.delete("/me/photo", response_model=UserOut)
def delete_my_photo(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    row = session.get(UserPhoto, user.id)
    if row:
        session.delete(row)
        session.commit()
    return UserOut.from_user(user, session)


@router.get("/users", response_model=List[UserOut])
def list_users(_: User = Depends(require_admin), session: Session = Depends(get_session)):
    users = session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
    return [UserOut.from_user(u, session) for u in users]


@router.post("/users", response_model=UserOut)
def add_user(payload: AddUserRequest, _: User = Depends(require_admin), session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email.lower())).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with that email already exists")
    password_policy.require(payload.password, payload.email, payload.name)
    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_secret(payload.password),
        is_admin=payload.is_admin,
        password_changed_at=datetime.utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut.from_user(user, session)


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


# --- Password, sessions and two-step sign-in ---

class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def _forget_all_sessions(user: User, session: Session) -> None:
    """Every access token and every remembered device the user has stops working."""
    user.token_version = (user.token_version or 0) + 1
    session.add(user)
    for row in session.exec(select(RememberToken).where(RememberToken.user_id == user.id)).all():
        session.delete(row)


@router.put("/me/password", response_model=AuthResult)
def change_my_password(payload: PasswordChange, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Needs the current password (wrong tries count toward the lock like at sign-in), refuses weak new
    ones, and signs every other session and remembered device out. Returns fresh tokens for this one."""
    now = _utcnow()
    _refuse_if_locked(user, now)
    if not verify_secret(payload.current_password, user.password_hash):
        raise _count_failure(session, user, now, "That isn't your current password")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=422, detail="Choose a password different from the current one")
    password_policy.require(payload.new_password, user.email, user.name)
    _clear_gate(session, user)
    user.password_hash = hash_secret(payload.new_password)
    user.password_changed_at = datetime.utcnow()
    user.must_change_password = False
    _forget_all_sessions(user, session)
    session.commit()
    return _issue_auth_result(user, session)


@router.post("/sign-out-everywhere")
def sign_out_everywhere(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Signs this account out on every computer and phone, this one included."""
    _forget_all_sessions(user, session)
    session.commit()
    return {"ok": True}


class AdminPasswordReset(BaseModel):
    new_password: str


def _user_or_404(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.post("/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, payload: AdminPasswordReset, admin: User = Depends(require_admin),
                         session: Session = Depends(get_session)):
    """Gives a user a new (temporary) password; they must change it at their next sign-in."""
    user = _user_or_404(session, user_id)
    password_policy.require(payload.new_password, user.email, user.name)
    user.password_hash = hash_secret(payload.new_password)
    user.password_changed_at = datetime.utcnow()
    user.must_change_password = True
    _clear_gate(session, user)
    _forget_all_sessions(user, session)
    session.commit()
    return {"ok": True}


@router.post("/users/{user_id}/unlock")
def unlock_user(user_id: int, admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    _clear_gate(session, _user_or_404(session, user_id))
    return {"ok": True}


@router.post("/users/{user_id}/sign-out")
def admin_sign_out(user_id: int, admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    _forget_all_sessions(_user_or_404(session, user_id), session)
    session.commit()
    return {"ok": True}


class TwoStepCode(BaseModel):
    code: str


class TwoStepDisable(BaseModel):
    password: str
    code: str


@router.post("/2fa/setup")
def two_step_setup(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Starts two-step sign-in: a new secret to put in an authenticator app. It is only switched on
    once a code from the app is confirmed (/2fa/enable)."""
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-step sign-in is already on")
    user.totp_secret = totp.new_secret()
    session.add(user)
    session.commit()
    return {"secret": user.totp_secret, "uri": totp.otpauth_uri(user.totp_secret, user.email)}


@router.post("/2fa/enable")
def two_step_enable(payload: TwoStepCode, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    if user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=400, detail="Start the setup first")
    step = totp.verify(user.totp_secret, payload.code)
    if step is None:
        raise HTTPException(status_code=400, detail="That code isn't right - check the app and try again")
    user.totp_enabled = True
    user.totp_last_step = step
    codes = _new_recovery_codes(user, session)
    session.add(user)
    session.commit()
    return {"recovery_codes": codes}


@router.post("/2fa/disable")
def two_step_disable(payload: TwoStepDisable, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    now = _utcnow()
    _refuse_if_locked(user, now)
    if not user.totp_enabled:
        return {"ok": True}
    if not verify_secret(payload.password, user.password_hash):
        raise _count_failure(session, user, now, "That isn't your password")
    if not _accept_second_step(user, payload.code, session):
        raise _count_failure(session, user, now, "That code isn't right")
    _clear_gate(session, user)
    _drop_two_step(user, session)
    session.commit()
    return {"ok": True}


def _drop_two_step(user: User, session: Session) -> None:
    user.totp_enabled, user.totp_secret, user.totp_last_step = False, None, None
    session.add(user)
    for row in session.exec(select(RecoveryCode).where(RecoveryCode.user_id == user.id)).all():
        session.delete(row)


@router.post("/users/{user_id}/two-step/reset")
def admin_reset_two_step(user_id: int, admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    """For someone who lost their phone and their recovery codes."""
    _drop_two_step(_user_or_404(session, user_id), session)
    session.commit()
    return {"ok": True}
