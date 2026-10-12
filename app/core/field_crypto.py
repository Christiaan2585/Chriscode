"""Encryption for the few database fields that must stay secret even if the database FILE is copied: today the two-step
(authenticator) secrets. Passwords, PINs, tokens and recovery codes are hashed already; those can't be hashed because
the app must read them back to check a code.

The key is 32 random bytes made on first use and kept next to the database in `field.key`, protected with Windows DPAPI
(backup_crypto.protect): only this Windows user on this PC can unwrap it. A stolen copy of the database therefore holds
only ciphertext. The flip side, on purpose: data restored onto ANOTHER computer can't read these fields - people then
sign in with a recovery code (those are hashes and work anywhere) and an admin resets their two-step.

Stored form: "enc1:" + base64(nonce12 + AES-256-GCM ciphertext). Anything without that prefix is from before
encryption and is read as it is (and encrypted at the next startup by encrypt_plain_totp_secrets).
"""
import base64
import json
import os
import secrets
import threading
from typing import Optional

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core import backup_crypto

PREFIX = "enc1:"
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_lock = threading.Lock()
_cached = {}


class Unreadable(ValueError):
    """The value was encrypted with a key this PC doesn't have, or it was altered."""


def key_file() -> str:
    data_dir = os.getenv("SANDVELD_DATA_DIR")
    return os.path.join(data_dir, "field.key") if data_dir else os.path.join(_PROJECT_ROOT, "config", "field.key")


def forget_cached_key() -> None:
    with _lock:
        _cached.clear()


def _key(create: bool) -> Optional[bytes]:
    path = key_file()
    with _lock:
        if path in _cached:
            return _cached[path]
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    key = base64.b64decode(backup_crypto.unprotect(json.load(f)))
            except (OSError, ValueError, KeyError):
                return None  # e.g. copied from another Windows account: unreadable here
        elif create:
            key = secrets.token_bytes(32)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            partial = path + ".partial"
            with open(partial, "w", encoding="utf-8") as f:
                json.dump(backup_crypto.protect(base64.b64encode(key).decode("ascii")), f)
            os.replace(partial, path)
        else:
            return None
        _cached[path] = key
        return key


def encrypt(text: str) -> str:
    nonce = secrets.token_bytes(12)
    return PREFIX + base64.b64encode(nonce + AESGCM(_key(create=True)).encrypt(nonce, text.encode("utf-8"), None)).decode("ascii")


def decrypt(value: Optional[str]) -> Optional[str]:
    if value is None or not value.startswith(PREFIX):
        return value  # empty, or from before encryption
    key = _key(create=False)
    if key is None:
        raise Unreadable("This value was encrypted on another computer.")
    try:
        blob = base64.b64decode(value[len(PREFIX):])
        return AESGCM(key).decrypt(blob[:12], blob[12:], None).decode("utf-8")
    except (InvalidTag, ValueError) as exc:
        raise Unreadable("This value can't be read on this computer.") from exc


def encrypt_plain_totp_secrets(session) -> int:
    """Startup: encrypts every two-step secret still stored readable (from before this version). Returns how many."""
    from sqlmodel import select
    from app.models.user import User
    changed = 0
    for user in session.exec(select(User).where(User.totp_secret.is_not(None))).all():
        if not user.totp_secret.startswith(PREFIX):
            user.totp_secret = encrypt(user.totp_secret)
            session.add(user)
            changed += 1
    if changed:
        session.commit()
    return changed
