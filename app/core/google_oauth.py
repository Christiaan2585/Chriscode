import json
import os
import re
from typing import Optional

import requests

from app.core import field_crypto

# Kept outside the app/ package (and gitignored) since it holds a real
# external credential once filled in - see SETUP_GOOGLE_LOGIN.md at the
# project root for how to obtain and fill in these values.
#
# SANDVELD_DATA_DIR (set by desktop-app/index.js only for a PACKAGED/installed
# build, never in dev mode) is the same writable per-user folder db.py uses -
# a packaged install's own folder can be read-only and gets wiped on every
# update, so the real config file has to live somewhere that survives that.
# Dev mode is untouched: no env var is set, so it keeps reading
# config/google_oauth.json next to the project exactly as before.
_data_dir = os.getenv("SANDVELD_DATA_DIR")
if _data_dir:
    _CONFIG_PATH = os.path.join(_data_dir, "google_oauth.json")
else:
    _CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config", "google_oauth.json")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def _read_config() -> dict:
    try:
        with open(_CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    try:
        config["client_secret"] = field_crypto.decrypt(config.get("client_secret"))  # plain text from an older hand-made file reads as it is
    except field_crypto.Unreadable:
        config["client_secret"] = None  # saved on another PC: set it up again here
    return config


_CLIENT_ID = re.compile(r"^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$")


def clean_client_id(value: Optional[str]) -> str:
    value = (value or "").strip()
    if not _CLIENT_ID.match(value):
        raise ValueError("That doesn't look like a Google Client ID. It is a long number followed by .apps.googleusercontent.com")
    return value


def clean_client_secret(value: Optional[str]) -> str:
    value = (value or "").strip()
    if not 10 <= len(value) <= 200 or re.search(r"\s", value):
        raise ValueError("That doesn't look like a Google Client secret. Copy it again without spaces (it often starts with GOCSPX-)")
    return value


def save_config(client_id: str, client_secret: str) -> None:
    """Turns Google sign-in on. The secret is stored encrypted (it is never sent back to the screen); takes effect at once."""
    config = {"client_id": clean_client_id(client_id), "client_secret": field_crypto.encrypt(clean_client_secret(client_secret))}
    os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)
    partial = _CONFIG_PATH + ".partial"
    with open(partial, "w", encoding="utf-8") as f:
        json.dump(config, f)
    os.replace(partial, _CONFIG_PATH)


def friendly_error(message: str) -> str:
    """Google's own wording ("invalid_client", a JSON blob) turned into what the person can do about it."""
    text = (message or "").lower()
    if "invalid_client" in text or "unauthorized_client" in text:
        return "Google didn't accept the Client ID or secret saved in Settings. An admin can check them under Settings, Sign in with Google."
    if "invalid_grant" in text or "expired" in text:
        return "That Google sign-in expired or was already used. Please try again."
    if "redirect_uri" in text:
        return "Google refused the sign-in address. In Google Cloud the client must be of type Desktop app. An admin can set it up again under Settings, Sign in with Google."
    if "not configured" in text:
        return "Sign in with Google isn't set up yet. An admin can do that under Settings, Sign in with Google."
    if "not verified" in text:
        return "Google says this account's email address isn't verified, so it can't be used to sign in."
    if "nonce" in text or "client mismatch" in text:
        return "That Google sign-in failed a safety check. Please try again."
    return "Google sign-in didn't work. Please try again, or sign in with your email and password."


def clear_config() -> None:
    try:
        os.remove(_CONFIG_PATH)
    except FileNotFoundError:
        pass


def summary() -> dict:
    """What the Settings screen may know: whether it is on and which Client ID - never the secret."""
    config = _read_config()
    return {"enabled": is_google_login_enabled(), "client_id": config.get("client_id") or None, "has_secret": bool(config.get("client_secret"))}


def get_google_client_id() -> Optional[str]:
    return _read_config().get("client_id") or None


def is_google_login_enabled() -> bool:
    config = _read_config()
    return bool(config.get("client_id") and config.get("client_secret"))


def exchange_code_for_profile(code: str, code_verifier: str, redirect_uri: str, expected_nonce: str) -> dict:
    """Exchanges an OAuth authorization code for the signed-in Google
    account's id_token, then verifies that id_token with Google directly
    (rather than trusting whatever the client hands us) and returns the
    profile fields we care about.

    expected_nonce must match the nonce claim Google embeds in the id_token -
    that nonce was generated fresh for this one sign-in attempt (see
    desktop-app/index.js), so this check is what stops a captured id_token
    from an earlier sign-in being replayed into a new session."""
    config = _read_config()
    client_id = config.get("client_id")
    client_secret = config.get("client_secret")
    if not client_id or not client_secret:
        raise RuntimeError("Google sign-in is not configured on this app yet")

    token_response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier,
        },
        timeout=10,
    )
    if not token_response.ok:
        raise RuntimeError(f"Google rejected the sign-in request: {token_response.text}")
    id_token = token_response.json().get("id_token")
    if not id_token:
        raise RuntimeError("Google did not return an id_token")

    info_response = requests.get(GOOGLE_TOKENINFO_URL, params={"id_token": id_token}, timeout=10)
    if not info_response.ok:
        raise RuntimeError("Could not verify the Google sign-in")
    info = info_response.json()

    if info.get("aud") != client_id:
        raise RuntimeError("Google sign-in verification failed (client mismatch)")
    if info.get("email_verified") not in ("true", True):
        raise RuntimeError("This Google account's email is not verified")
    if info.get("nonce") != expected_nonce:
        raise RuntimeError("Google sign-in failed a security check (nonce mismatch) - please try again")

    return {
        "sub": info["sub"],
        "email": info["email"],
        "name": info.get("name") or info["email"],
        "picture": info.get("picture"),
    }
