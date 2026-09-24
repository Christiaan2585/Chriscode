import json
import os
from typing import Optional

import requests

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
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


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
