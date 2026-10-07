"""Time-based one-time codes (RFC 6238) for two-step sign-in with an authenticator
app (Google Authenticator, Microsoft Authenticator, Authy...). Nothing but the
standard library: HMAC-SHA1, 6 digits, a new code every 30 seconds."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

ISSUER = "Sandveld Vee Dienste"
STEP = 30
DIGITS = 6


def new_secret() -> str:
    """20 random bytes as base32 (32 characters, what authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def code_at(secret: str, when: float, digits: int = DIGITS) -> str:
    key = base64.b32decode(secret.replace(" ", "").upper())
    counter = struct.pack(">Q", int(when // STEP))
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(value).zfill(digits)


def verify(secret: str, code, now: float | None = None, window: int = 1, after_step: int | None = None):
    """The 30-second step the code belongs to, or None. A code is accepted a step
    early or late (clocks drift) but never for a step at or before `after_step`:
    the last one used, so a code can't be replayed."""
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(code) != DIGITS:
        return None
    now = time.time() if now is None else now
    current = int(now // STEP)
    for step in range(current - window, current + window + 1):
        if after_step is not None and step <= after_step:
            continue
        if hmac.compare_digest(code_at(secret, step * STEP), code):
            return step
    return None


def otpauth_uri(secret: str, account: str) -> str:
    return f"otpauth://totp/{quote(ISSUER)}:{quote(account)}?secret={secret}&issuer={quote(ISSUER)}&algorithm=SHA1&digits={DIGITS}&period={STEP}"
