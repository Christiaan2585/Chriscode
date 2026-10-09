import json
import logging
import os

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session
from app.core import audit, herding
from app.core.db import create_db_and_tables, database_file_path, engine
from app.core.backup import backup_on_version_change, start_scheduler
from app.core.local_secret import LocalSecretGuard, configured_secret
from app.core.security import get_current_user
from app.api import audit as audit_api, auth, clients, animals, rams, medical, programs, products, invoices, notes, weights, schedules, analytics, herds, appointments, quotes, orders, dosing, backups, exports, business, purchase_orders, devices, catalogue

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Sandveld Vee Dienste API")


# Catches any unhandled exception (a bug in a route, a bad row during an
# import, etc.) and turns it into a normal JSON error response instead of
# letting it crash out of the app as a raw, unhandled exception.
#
# This matters for a subtle but important reason: Starlette/FastAPI's CORS
# middleware only adds its "Access-Control-Allow-Origin" headers to
# responses that come back through it normally. An unhandled exception
# skips past CORS middleware entirely on its way to Starlette's built-in
# error handler, so the resulting 500 response has NO CORS headers at all.
# The desktop app's frontend runs on a different origin (localhost:5173)
# than the backend (localhost:8000), so the browser then refuses to let
# JavaScript read that response - axios (or fetch) sees a generic,
# contentless "Network Error" with no status code and no message, no
# matter what the real error was. That is exactly what shows up on screen
# as an unhelpful "Import failed - check the file and try again." with no
# further detail, even though the backend did have a specific reason.
#
# Registering this as a plain @app.middleware("http") - and doing so BEFORE
# app.add_middleware(CORSMiddleware, ...) below - places it *inside* the
# CORS middleware layer. So by the time an exception happens, this catches
# it and returns an ordinary JSONResponse; CORS middleware then sees a
# normal, successful response passing through it (no exception ever
# reaches it) and adds its headers as usual. The real error message can
# then actually reach the screen.
@app.middleware("http")
async def catch_unhandled_exceptions(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        # The reason stays in the log; the caller gets none (it can hold file paths or database details).
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server. Please try again; if it keeps happening, tell whoever supports this app."})


# Only the dev frontend (Vite) is a browser origin that legitimately calls
# this API. The packaged app loads from file:// and Electron sends no Origin
# header for those requests (verified), and the Streamlit dashboard calls
# from Python - neither is subject to CORS. With "*", any website open in
# the user's normal browser could script requests at this localhost API
# (e.g. hammer /auth/login, or claim /auth/setup on a fresh install).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# The activity log: who changed what (see app/core/audit.py). Inside the phone
# listener's guard (lan.DeviceGuard), so it knows when a change came from a phone.
app.add_middleware(audit.AuditMiddleware)
# The desktop window proves it is the Sandveld app with a per-launch secret
# (see app/core/local_secret.py); a no-op unless the launcher set one.
app.add_middleware(LocalSecretGuard)

app.include_router(auth.router)
# Phones (Settings -> Phones): not behind the router-wide sign-in because a
# phone pairs before it has an account token - /devices/pair is guarded by a
# one-time code, every other route in it by require_admin + require_local.
app.include_router(devices.router)

# Every business route requires a signed-in user. auth.router is included
# above this line (unprotected: you need to be able to log in before you
# have a token), and / and /version stay open below (so the desktop app's
# own boot-time backend health check keeps working without a token).
_protected = [Depends(get_current_user)]
app.include_router(clients.router, dependencies=_protected)
app.include_router(animals.router, dependencies=_protected)
app.include_router(rams.router, dependencies=_protected)
app.include_router(medical.router, dependencies=_protected)
app.include_router(programs.router, dependencies=_protected)
app.include_router(products.router, dependencies=_protected)
app.include_router(invoices.router, dependencies=_protected)
app.include_router(notes.router, dependencies=_protected)
app.include_router(weights.router, dependencies=_protected)
app.include_router(schedules.router, dependencies=_protected)
app.include_router(analytics.router, dependencies=_protected)
app.include_router(herds.router, dependencies=_protected)
app.include_router(appointments.router, dependencies=_protected)
app.include_router(quotes.router, dependencies=_protected)
app.include_router(orders.router, dependencies=_protected)
app.include_router(dosing.router, dependencies=_protected)
app.include_router(backups.router, dependencies=_protected)
app.include_router(exports.router, dependencies=_protected)
app.include_router(business.router, dependencies=_protected)
app.include_router(purchase_orders.router, dependencies=_protected)
app.include_router(catalogue.router, dependencies=_protected)
app.include_router(audit_api.router, dependencies=_protected)

def _version_info() -> dict:
    # Bundled into the packaged backend by build_and_package.bat's
    # --add-data; without that every installed copy reported "0.0.0".
    version_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "version.json")
    try:
        with open(version_file, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


@app.on_event("startup")
def on_startup():
    # Before create_db_and_tables(): the first run of a new version must
    # snapshot the data before its schema sync touches it.
    try:
        backup_on_version_change(database_file_path(), _version_info().get("version", "0.0.0"))
    except Exception:
        logger.exception("Pre-update backup failed")
    create_db_and_tables()
    try:
        with Session(engine) as session:
            herding.ensure_standard_programs(session)  # clients from before the master program existed
    except Exception:
        logger.exception("Couldn't give the clients the standard herding program")
    try:
        with Session(engine) as session:
            audit.prune(session)  # the activity log keeps a year, at most 100,000 lines
    except Exception:
        logger.exception("Couldn't tidy the activity log")
    start_scheduler(database_file_path())
    try:
        devices.start_if_enabled(app)  # the phone connection, if Settings -> Phones had it on
    except Exception:
        logger.exception("Couldn't start the phone connection")


@app.on_event("shutdown")
def on_shutdown():
    devices.SERVER.stop()

@app.get("/local-check")
def local_check(request: Request):
    """For the launcher: does this backend want the per-launch secret, and is the one sent the right one?
    (Open to everyone - it only answers about the secret it was given, never reveals it.)"""
    import hmac
    wanted = configured_secret()
    given = request.headers.get("x-local-secret", "")
    return {"secret_required": bool(wanted), "match": (not wanted) or hmac.compare_digest(given.encode(), wanted.encode())}


@app.get("/")
def read_root():
    return {"message": "Welcome to Sandveld Vee Dienste API"}

@app.get("/version")
def read_version():
    data = _version_info()
    return {
        "app_name": "Sandveld Vee Dienste",
        "version": data.get("version", "0.0.0"),
        "last_updated": data.get("last_updated"),
        # Shown in Settings so a user (or whoever supports them) can find the
        # live database file for a backup without needing to know about
        # SANDVELD_DATA_DIR or dig through AppData by hand.
        "database_path": database_file_path(),
    }
