"""The activity log (Settings -> Activity log). Every change anyone makes - and
a few sensitive reads such as downloading a tax certificate or exporting all the
data - is written down: who, what, when and from where (the PC or a phone).
Only the "what": the request's body, passwords and amounts are never stored.

A small ASGI middleware does the writing, so no endpoint has to remember to;
sign-in events are recorded by the sign-in code itself."""
import re
from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from app.models.audit import AuditEntry

KEEP_DAYS = 365
MAX_ROWS = 100_000

_ENTITIES = {
    "clients": "client", "products": "product", "invoices": "invoice", "quotes": "quote", "orders": "order",
    "purchase-orders": "purchase order", "programs": "herding program", "appointments": "appointment",
    "notes": "note", "animals": "animal", "herds": "herd", "schedules": "schedule", "medical": "medical record",
    "weights": "weight record", "dosing": "dosing rule", "business": "company details", "catalogue": "catalogue",
    "devices": "phone", "backups": "backup", "exports": "export", "auth": "user",
}

# (method, path pattern) -> (action, entity). Checked in order; the first match wins.
_SPECIAL = [
    ("POST", r"^/backups/restore$", "Restored a backup", "backup"),
    ("POST", r"^/backups/run$", "Ran a backup", "backup"),
    ("PUT", r"^/backups/settings$", "Changed backup settings", "backup"),
    ("GET", r"^/exports/", "Exported all data to Excel", "export"),
    ("GET", r"^/clients/(\d+)/export$", "Exported a client's data", "client"),
    ("POST", r"^/clients/(\d+)/erase$", "Erased a client's personal details", "client"),
    ("GET", r"^/clients/(\d+)/tax-certificate$", "Downloaded tax certificate of client", "client"),
    ("PUT", r"^/clients/(\d+)/tax-certificate$", "Added tax certificate to client", "client"),
    ("DELETE", r"^/clients/(\d+)/tax-certificate$", "Deleted tax certificate from client", "client"),
    ("POST", r"^/auth/users$", "Added a staff account", "user"),
    ("DELETE", r"^/auth/users/(\d+)$", "Deactivated a staff account", "user"),
    ("POST", r"^/auth/users/(\d+)/reset-password$", "Reset a staff password", "user"),
    ("POST", r"^/auth/users/(\d+)/unlock$", "Unlocked a staff account", "user"),
    ("POST", r"^/auth/users/(\d+)/sign-out$", "Signed a staff member out everywhere", "user"),
    ("POST", r"^/auth/users/(\d+)/two-step/reset$", "Turned off a staff member's two-step sign-in", "user"),
    ("POST", r"^/auth/sign-out-everywhere$", "Signed out everywhere", "user"),
    ("PUT", r"^/auth/me/password$", "Changed their password", "user"),
    ("POST", r"^/auth/2fa/setup$", "Started setting up two-step sign-in", "user"),
    ("POST", r"^/auth/pin/setup$", "Changed their PIN", "user"),
    ("POST", r"^/auth/2fa/enable$", "Turned on two-step sign-in", "user"),
    ("POST", r"^/auth/2fa/disable$", "Turned off two-step sign-in", "user"),
    ("PUT|DELETE", r"^/auth/me/photo$", "Changed their photo", "user"),
    ("PUT", r"^/auth/me$", "Changed their details", "user"),
    ("PUT", r"^/business/?$", "Changed the company details", "company details"),
    ("PUT", r"^/devices/lan$", "Changed phone access", "phone"),
    ("POST", r"^/devices/pairing$", "Showed a phone pairing code", "phone"),
    ("DELETE", r"^/devices/(\d+)$", "Removed a phone", "phone"),
    ("POST", r"^/programs/(\d+)/copy$", "Copied herding program", "herding program"),
    ("POST", r"^/programs/(\d+)/steps/(\d+)/invoice$", "Made an invoice from a herding program", "herding program"),
    ("PUT", r"^/programs/(\d+)/quote/status$", "Changed a program's quote status", "herding program"),
]
_SPECIAL = [(set(m.split("|")), re.compile(p), a, e) for m, p, a, e in _SPECIAL]

# Never logged: reads, and sign-in itself (the sign-in code records that with more detail).
_SKIP = re.compile(r"^/(auth/(login|pin/verify|google/callback|forget-device|status)|devices/pair|audit)(/|$)")
_VERBS = {"POST": "Added", "PUT": "Changed", "PATCH": "Changed"}


def describe(method: str, path: str) -> Optional[dict]:
    """What a request means in words, or None for something not worth logging."""
    path = "/" + path.strip("/") if path.strip("/") else "/"
    if _SKIP.match(path):
        return None
    for methods, pattern, action, entity in _SPECIAL:
        found = pattern.match(path)
        if method in methods and found:
            return {"action": action, "entity": entity, "entity_id": found.group(1) if found.groups() else None}
    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        return None
    parts = path.strip("/").split("/")
    entity = _ENTITIES.get(parts[0])
    if entity is None:
        return None
    entity_id = parts[1] if len(parts) > 1 and parts[1].isdigit() else None
    if len(parts) >= 3 and entity_id:  # something inside it: /programs/3/steps/9
        inner = parts[2]
        action = {"DELETE": f"Deleted from {entity} ({inner})", "POST": f"Added to {entity} ({inner})"}.get(method, f"Changed {entity} ({inner})")
    elif method == "DELETE":
        action = f"Deleted {entity}"
    else:
        action = f"{_VERBS[method]} {entity}"
    return {"action": action, "entity": entity, "entity_id": entity_id}


def record(session: Session, user, action: str, entity: Optional[str] = None, entity_id=None, summary: Optional[str] = None,
           result: str = "ok", via: str = "pc") -> None:
    session.add(AuditEntry(user_id=getattr(user, "id", None), user_name=getattr(user, "name", None), action=action,
                           entity=entity, entity_id=None if entity_id is None else str(entity_id),
                           summary=(summary or None) and summary[:300], result=result, via=via))
    session.commit()


def prune(session: Session, keep_days: int = KEEP_DAYS, max_rows: int = MAX_ROWS) -> None:
    """Entries older than a year go, and the log never grows past `max_rows`."""
    cutoff = datetime.utcnow() - timedelta(days=keep_days)
    for row in session.exec(select(AuditEntry).where(AuditEntry.at < cutoff)).all():
        session.delete(row)
    session.commit()
    extra = len(session.exec(select(AuditEntry.id)).all()) - max_rows
    if extra > 0:
        for row in session.exec(select(AuditEntry).order_by(AuditEntry.at, AuditEntry.id).limit(extra)).all():
            session.delete(row)
        session.commit()


class AuditMiddleware:
    """Writes a log entry for each change a signed-in person makes (after the
    response, so it never slows or breaks the request). A refused change (403 or
    409, e.g. deleting a client who has invoices) is logged as "refused"; errors
    and validation failures are not."""

    def __init__(self, app, session_factory=None):
        self.app = app
        self._session_factory = session_factory

    def _sessions(self):
        if self._session_factory:
            return self._session_factory()
        from app.core import db
        return Session(db.engine)

    def _write(self, scope, status: int, meaning: dict) -> None:
        from app.core.security import decode_access_token
        from app.models.user import User

        headers = dict(scope.get("headers") or [])
        auth = headers.get(b"authorization", b"").decode("latin-1")
        if not auth.lower().startswith("bearer "):
            return
        try:
            user_id, _ = decode_access_token(auth[7:])
        except Exception:
            return
        with self._sessions() as session:
            user = session.get(User, user_id)
            if user is None:
                return
            record(session, user, meaning["action"], meaning["entity"], meaning["entity_id"],
                   summary=f"{scope['method']} {scope['path']}", result="ok" if status < 400 else "refused",
                   via="phone" if scope.get("state", {}).get("via_lan") else "pc")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        meaning = describe(scope["method"], scope["path"])
        status = {"code": 0}

        async def watching(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        await self.app(scope, receive, watching)
        if meaning and (status["code"] < 400 or status["code"] in (403, 409)):
            try:
                await run_in_threadpool(self._write, scope, status["code"], meaning)
            except Exception:  # the log must never break the app
                pass
