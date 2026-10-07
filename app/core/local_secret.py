"""A per-launch secret between the desktop window and its own backend.

The desktop app generates a random secret each time it starts, gives it to the
backend it launches (environment variable SANDVELD_LOCAL_SECRET) and adds it to
every request its own window sends to the backend (header X-Local-Secret). The
backend then refuses requests that don't carry it, so other programs on the PC
- another Windows user's, a sandboxed one, a script someone left running - can't
simply talk to the local API. (They still would need a sign-in as well; this is
a second lock on the door, not the only one.)

Not needed, and not applied, when no secret is set (development, tests, the
Streamlit dashboard) or for phones (they have their own device token, see
lan.DeviceGuard). `/` and `/version` stay open so the launcher can tell the
backend is up."""
import hmac
import os

from starlette.responses import JSONResponse

HEADER = b"x-local-secret"
OPEN_PATHS = {"/", "/version", "/local-check"}  # /local-check answers for itself: see main.py


def configured_secret() -> str:
    return os.getenv("SANDVELD_LOCAL_SECRET", "")


class LocalSecretGuard:
    def __init__(self, app, secret: str | None = None):
        self.app = app
        self._secret = secret  # None = read the environment on each request (so tests can change it)

    async def __call__(self, scope, receive, send):
        secret = self._secret if self._secret is not None else configured_secret()
        if (scope["type"] not in ("http", "websocket") or not secret or scope.get("method") == "OPTIONS"
                or scope.get("state", {}).get("via_lan") or scope.get("path") in OPEN_PATHS):
            return await self.app(scope, receive, send)
        given = dict(scope.get("headers") or []).get(HEADER, b"").decode("latin-1")
        if not hmac.compare_digest(given.encode("utf-8"), secret.encode("utf-8")):
            response = JSONResponse({"detail": "This request didn't come from the Sandveld app"}, status_code=403)
            return await response(scope, receive, send)
        return await self.app(scope, receive, send)
