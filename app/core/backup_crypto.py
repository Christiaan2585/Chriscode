"""Locking backups with a passphrase.

A locked backup is AES-256-GCM (authenticated: a wrong passphrase or a damaged
file is detected, not turned into garbage) with a key stretched from the
passphrase by scrypt, so guessing passphrases offline is slow. Layout:
`SVDBK1` | 16-byte salt | 12-byte nonce | ciphertext+tag.

The passphrase is also remembered on this PC so the nightly backups can lock
themselves. On Windows it is saved with DPAPI, i.e. tied to the Windows user
account: copying the settings file to another computer (or having it read by
another user) gives nothing. Elsewhere (development) it is only encoded. The
person must keep the passphrase somewhere safe: it is the only way to restore
a locked backup on another PC."""
import base64
import ctypes
import os
import sys
from ctypes import wintypes

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from app.core import password_policy

MAGIC = b"SVDBK1"
SALT_BYTES, NONCE_BYTES = 16, 12
MIN_PASSPHRASE = 12


class WrongPassphrase(ValueError):
    pass


def check_passphrase(passphrase: str) -> None:
    problems = []
    if len(passphrase or "") < MIN_PASSPHRASE:
        problems.append(f"use at least {MIN_PASSPHRASE} characters")
    problems += [p for p in password_policy.problems(passphrase) if not p.startswith("use at least")]
    if problems:
        raise ValueError("Choose a stronger passphrase: " + "; ".join(problems) + ".")


def _key(passphrase: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=2 ** 15, r=8, p=1).derive(passphrase.encode("utf-8"))


def encrypt(data: bytes, passphrase: str) -> bytes:
    salt, nonce = os.urandom(SALT_BYTES), os.urandom(NONCE_BYTES)
    return MAGIC + salt + nonce + AESGCM(_key(passphrase, salt)).encrypt(nonce, data, MAGIC + salt)


def decrypt(blob: bytes, passphrase: str) -> bytes:
    header = len(MAGIC) + SALT_BYTES + NONCE_BYTES
    if not blob.startswith(MAGIC) or len(blob) < header + 16:
        raise WrongPassphrase("That isn't a locked Sandveld backup.")
    salt = blob[len(MAGIC):len(MAGIC) + SALT_BYTES]
    nonce = blob[len(MAGIC) + SALT_BYTES:header]
    try:
        return AESGCM(_key(passphrase, salt)).decrypt(nonce, blob[header:], MAGIC + salt)
    except InvalidTag:
        raise WrongPassphrase("Wrong passphrase, or the backup file is damaged.")


# --- Remembering the passphrase on this PC ---

class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(data: bytes, protect: bool) -> bytes:
    crypt32, kernel32 = ctypes.windll.crypt32, ctypes.windll.kernel32
    source = _Blob(len(data), ctypes.cast(ctypes.create_string_buffer(data, len(data)), ctypes.POINTER(ctypes.c_char)))
    out = _Blob()
    call = crypt32.CryptProtectData if protect else crypt32.CryptUnprotectData
    if not call(ctypes.byref(source), None, None, None, None, 0, ctypes.byref(out)):
        raise OSError("Windows couldn't protect or unprotect the passphrase")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        kernel32.LocalFree(out.pbData)


def protect(passphrase: str) -> dict:
    raw = passphrase.encode("utf-8")
    if sys.platform == "win32":
        return {"scheme": "dpapi", "data": base64.b64encode(_dpapi(raw, True)).decode("ascii")}
    return {"scheme": "plain", "data": base64.b64encode(raw).decode("ascii")}


def unprotect(saved: dict) -> str:
    raw = base64.b64decode(saved["data"])
    if saved.get("scheme") == "dpapi":
        raw = _dpapi(raw, False)
    return raw.decode("utf-8")
