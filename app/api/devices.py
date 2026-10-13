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
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core import audit, lan, relay_agent
from app.core.db import get_session
from app.core.security import require_admin
from app.models.device import PairedDevice

router = APIRouter(prefix="/devices", tags=["Phones"])

PAIRING_CODES = lan.PairingCodes()
SERVER = lan.LanServer()
RELAY = relay_agent.RelayAgent()


def require_local(request: Request) -> None:
    if getattr(request.state, "via_lan", False):
        raise HTTPException(status_code=403, detail="This can only be done on the office PC")


def require_phone(request: Request) -> None:
    """The reverse of require_local: only over the phone connection (where DeviceGuard has already checked the token)."""
    if not getattr(request.state, "via_lan", False):
        raise HTTPException(status_code=403, detail="This is for paired phones")


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
    addresses = lan.local_addresses()
    return {"enabled": settings["enabled"], "running": SERVER.running, "error": SERVER.error if settings["enabled"] else None,
            "port": settings["port"], "addresses": addresses, "fingerprint": fingerprint, "tailscale": lan.tailscale_status(addresses),
            "relay": relay_status()}


# --- The connection relay: how phones reach this PC from anywhere (app/core/relay_agent.py, relay/server.py) ---

def relay_status() -> dict:
    return {**relay_agent.load_relay_settings(lan.default_dir()), **RELAY.status()}


def relay_payload() -> Optional[dict]:
    """What a phone needs to reach this PC through the relay - given only to phones being paired or already paired."""
    directory = lan.default_dir()
    settings = relay_agent.load_relay_settings(directory)
    if not settings["enabled"]:
        return None
    identity = relay_agent.load_identity(directory)
    return {"host": settings["host"], "port": settings["port"], "office": identity.office, "key": identity.phone_key}


def apply_relay() -> None:
    """Start, restart or stop the agent to match the settings; it only runs while the phone listener does."""
    directory = lan.default_dir()
    settings = relay_agent.load_relay_settings(directory)
    if settings["enabled"] and SERVER.running:
        RELAY.start(settings["host"], settings["port"], lan.load_settings(directory)["port"], relay_agent.load_identity(directory))
    else:
        RELAY.stop()


class RelayUpdate(BaseModel):
    enabled: bool
    address: Optional[str] = Field(default=None, max_length=300)  # "relay.example.com" or "relay.example.com:8447"


@router.get("/relay", dependencies=_PC_ADMIN)
def read_relay():
    return relay_status()


@router.put("/relay", dependencies=_PC_ADMIN)
def update_relay(data: RelayUpdate):
    directory = lan.default_dir()
    current = relay_agent.load_relay_settings(directory)
    host, port = current["host"], current["port"]
    if data.address is not None:
        if data.address.strip():
            try:
                host, port = relay_agent.parse_relay(data.address)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
        else:
            host, port = None, relay_agent.DEFAULT_RELAY_PORT
    if data.enabled and not host:
        raise HTTPException(status_code=422, detail="Enter the relay's address first")
    relay_agent.save_relay_settings(directory, data.enabled, host, port)
    apply_relay()
    return relay_status()


@router.post("/relay/new-key", dependencies=_PC_ADMIN)
def new_relay_key():
    """A new key for phones to use the relay: a phone that was removed (or lost) with the old one can no longer
    reach this PC through it. Phones still paired learn the new key the next time they reach the PC."""
    relay_agent.rotate_phone_key(lan.default_dir())
    apply_relay()
    return relay_status()


@router.get("/addresses", dependencies=[Depends(require_phone)])
def current_addresses():
    """The PC's addresses right now. A phone that is already connected asks, and keeps whatever is new, so it still
    finds the PC when the router changes its address or Tailscale is installed later (no pairing again)."""
    return {"addresses": lan.local_addresses(), "port": lan.load_settings(lan.default_dir())["port"], "relay": relay_payload()}


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
    apply_relay()
    return lan_status()


@router.post("/pairing", dependencies=_PC_ADMIN)
def new_pairing_code():
    """A one-time code plus everything a phone needs to find and trust this
    PC, for the QR code in Settings."""
    status = lan_status()
    if not status["running"]:
        raise HTTPException(status_code=409, detail="Switch on \"Allow phones\" first")
    code = PAIRING_CODES.create()
    offer = {"app": "sandveld", "v": 1, "hosts": status["addresses"], "port": status["port"],
             "fp": status["fingerprint"], "code": code["code"]}
    relay = relay_payload()
    if relay:
        offer["relay"] = relay
    payload = json.dumps(offer, separators=(",", ":"))
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
        apply_relay()
