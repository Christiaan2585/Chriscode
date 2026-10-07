"""Settings -> Phones: switching the phone connection on and off, pairing
phones by QR code, and removing them. See app/core/lan.py.

Deliberately NOT behind main.py's router-wide sign-in: POST /devices/pair
must work for a phone that isn't signed in yet - it's protected by the
one-time pairing code instead. Every other route here needs an admin, and
only from the PC itself (require_local), never over the phone connection."""
import base64
import json
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core import audit, lan
from app.core.db import get_session
from app.core.security import require_admin
from app.models.device import PairedDevice

router = APIRouter(prefix="/devices", tags=["Phones"])

PAIRING_CODES = lan.PairingCodes()
SERVER = lan.LanServer()


def require_local(request: Request) -> None:
    if getattr(request.state, "via_lan", False):
        raise HTTPException(status_code=403, detail="This can only be done on the office PC")


_PC_ADMIN = [Depends(require_local), Depends(require_admin)]


class PairRequest(BaseModel):
    code: str = Field(max_length=20)
    name: str = Field(min_length=1, max_length=60)


class LanUpdate(BaseModel):
    enabled: bool


@router.post("/pair")
def pair_device(data: PairRequest, session: Session = Depends(get_session)):
    """A phone trades a pairing code (shown on the PC) for its own token."""
    if not PAIRING_CODES.consume(data.code):
        raise HTTPException(status_code=403, detail="That pairing code is wrong or has expired - make a new one on the office PC")
    token = secrets.token_urlsafe(32)
    device = PairedDevice(name=data.name.strip() or "Phone", token_hash=lan.hash_token(token))
    session.add(device)
    session.commit()
    session.refresh(device)
    audit.record(session, None, "Paired a phone", "phone", device.id, summary=device.name, via="phone")
    return {"device_id": device.id, "device_token": token}


@router.get("/", dependencies=_PC_ADMIN)
def list_devices(session: Session = Depends(get_session)):
    rows = session.exec(select(PairedDevice).order_by(PairedDevice.created_at)).all()
    return [{"id": d.id, "name": d.name, "created_at": d.created_at, "last_seen_at": d.last_seen_at} for d in rows]


@router.delete("/{device_id}", dependencies=_PC_ADMIN)
def remove_device(device_id: int, session: Session = Depends(get_session)):
    device = session.get(PairedDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Phone not found")
    session.delete(device)
    session.commit()
    return {"ok": True}


def lan_status() -> dict:
    directory = lan.default_dir()
    settings = lan.load_settings(directory)
    fingerprint = lan.ensure_certificate(directory)[2] if SERVER.running else None
    return {"enabled": settings["enabled"], "running": SERVER.running, "error": SERVER.error if settings["enabled"] else None,
            "port": settings["port"], "addresses": lan.local_addresses(), "fingerprint": fingerprint}


@router.get("/lan", dependencies=_PC_ADMIN)
def read_lan():
    return lan_status()


@router.put("/lan", dependencies=_PC_ADMIN)
def update_lan(data: LanUpdate, request: Request):
    directory = lan.default_dir()
    settings = {**lan.load_settings(directory), "enabled": data.enabled}
    lan.save_settings(directory, settings)
    if data.enabled:
        SERVER.start(request.app, directory, settings["port"])
    else:
        SERVER.stop()
    return lan_status()


@router.post("/pairing", dependencies=_PC_ADMIN)
def new_pairing_code():
    """A one-time code plus everything a phone needs to find and trust this
    PC, for the QR code in Settings."""
    status = lan_status()
    if not status["running"]:
        raise HTTPException(status_code=409, detail="Switch on \"Allow phones\" first")
    code = PAIRING_CODES.create()
    payload = json.dumps({"app": "sandveld", "v": 1, "hosts": status["addresses"], "port": status["port"],
                          "fp": status["fingerprint"], "code": code["code"]}, separators=(",", ":"))
    # sandveld://pair?d=<data> rather than bare JSON, so any camera app's
    # QR reader offers "open in Sandveld" instead of just showing text -
    # the Android app never needs its own in-app scanner.
    encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    qr = f"sandveld://pair?d={encoded}"
    return {"code": code["code"], "expires_at": code["expires_at"], "qr": qr, **status}


def start_if_enabled(app) -> None:
    """Called on startup: bring the phone connection back if it was on."""
    directory = lan.default_dir()
    settings = lan.load_settings(directory)
    if settings["enabled"]:
        SERVER.start(app, directory, settings["port"])
