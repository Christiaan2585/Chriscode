"""What counts as an acceptable password. Length matters most; the obvious
ones are refused, and so is anything built from the person's own email or name."""
import re

from fastapi import HTTPException

MIN_LENGTH = 10
MAX_LENGTH = 128  # bcrypt only reads the first 72 bytes anyway; this stops absurd inputs

# The passwords people (and password-guessing programs) try first. Compared in
# lower case with everything but letters and digits stripped, so "Password-123!"
# is caught as "password123".
_COMMON = frozenset("""
password password1 password12 password123 password1234 passw0rd p@ssw0rd passwort 123456 1234567 12345678 123456789
1234567890 0123456789 987654321 9876543210 111111 11111111 1111111111 000000 00000000 0000000000 123123 123123123
qwerty qwerty123 qwertyuiop qwertyuiop123 qwerty1234 1q2w3e4r 1q2w3e4r5t zaq12wsx asdfgh asdfghjkl asdfghjkl123 zxcvbnm
letmein letmein123 welcome welcome1 welcome123 admin admin123 administrator iloveyou abc123 abcd1234 abcdefgh
monkey dragon football baseball master sunshine princess shadow trustno1 changeme changeme123 default secret
sandveld sandveld123 sandveldveedienste sandveldvee kyronagri kyronagri123 farm farm123 farmer farmer123 boer boer123
suid-afrika suidafrika southafrica southafrica123 johannesburg capetown pretoria springbok springbok1 rugby rugby123
""".split())

_WORD = re.compile(r"[a-z0-9]+")


def _squash(text: str) -> str:
    return "".join(_WORD.findall((text or "").lower()))


def _is_run(password: str) -> bool:
    """aaaaaaaaaa, abcdefghij, 9876543210: every step the same."""
    codes = [ord(c) for c in password]
    steps = {b - a for a, b in zip(codes, codes[1:])}
    return len(steps) == 1 and steps <= {0, 1, -1}


def problems(password: str, email: str | None = None, name: str | None = None) -> list:
    out = []
    password = password or ""
    if len(password) < MIN_LENGTH:
        out.append(f"use at least {MIN_LENGTH} characters")
    if len(password) > MAX_LENGTH:
        out.append(f"use at most {MAX_LENGTH} characters")
    if len(set(password)) < 4 or (len(password) >= 4 and _is_run(password)):
        out.append("don't use a repeated or in-a-row pattern like aaaaaaaaaa or 1234567890")
    squashed = _squash(password)
    if squashed in _COMMON or squashed.rstrip("0123456789") in _COMMON:  # also "password2026", "welcome99"
        out.append("that password is too common - pick something only you would know")
    own = {_squash((email or "").split("@")[0])} | {_squash(part) for part in re.split(r"\s+", name or "")}
    if any(len(word) >= 4 and word in squashed for word in own):
        out.append("don't use your own name or email in the password")
    return out


def require(password: str, email: str | None = None, name: str | None = None) -> None:
    found = problems(password, email, name)
    if found:
        raise HTTPException(status_code=422, detail="Choose a stronger password: " + "; ".join(found) + ".")
