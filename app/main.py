import json
import logging
import os

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.db import create_db_and_tables, database_file_path
from app.core.security import get_current_user
from app.api import auth, clients, animals, medical, programs, products, invoices, notes, weights, schedules, analytics, herds, appointments, quotes, orders, dosing

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
        return JSONResponse(status_code=500, content={"detail": f"Server error: {exc}"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)

# Every business route requires a signed-in user. auth.router is included
# above this line (unprotected: you need to be able to log in before you
# have a token), and / and /version stay open below (so the desktop app's
# own boot-time backend health check keeps working without a token).
_protected = [Depends(get_current_user)]
app.include_router(clients.router, dependencies=_protected)
app.include_router(animals.router, dependencies=_protected)
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

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

@app.get("/")
def read_root():
    return {"message": "Welcome to Sandveld Vee Dienste API"}

@app.get("/version")
def read_version():
    version_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "version.json")
    try:
        with open(version_file, "r") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    return {
        "app_name": "Sandveld Vee Dienste",
        "version": data.get("version", "0.0.0"),
        "last_updated": data.get("last_updated"),
        # Shown in Settings so a user (or whoever supports them) can find the
        # live database file for a backup without needing to know about
        # SANDVELD_DATA_DIR or dig through AppData by hand.
        "database_path": database_file_path(),
    }
