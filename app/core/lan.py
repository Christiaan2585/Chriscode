"""Letting phones on the office network reach this backend (the Android
app, Phase 1).

The desktop app keeps talking to 127.0.0.1:8000 over plain HTTP exactly as
before. Phones get a second listener, only while Settings -> Phones -> "Allow
phones" is on: HTTPS on every network interface, with a certificate this PC
makes for itself (the phone pins its fingerprint, learnt from the pairing QR
code, so no certificate authority is involved). In front of the whole API on
that listener sits DeviceGuard: nothing gets through without the token of a
paired phone, except the pairing call itself, which needs a one-time code
shown on the PC.
"""
import hashlib
import hmac
import json
import logging
import os
import secrets
import socket
import threading
import time
from datetime import datetime, timedelta, timezone

from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("uvicorn.error")

DEFAULT_PORT = 8443
DEVICE_HEADER = "x-device-token"
OPEN_PATHS = {("POST", "/devices/pair")}
# The Android app's page is served from this origin (Capacitor's default), so everything it asks the PC is
# cross-origin. Only the phone listener answers it, and only for this exact origin; every call still needs the
# paired phone's token (the preflight, which a browser sends without one, is the one exception).
APP_ORIGIN = b"https://localhost"
CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
CORS_HEADERS = "authorization, content-type, x-device-token"
CORS_EXPOSE = "content-disposition, content-type"
PAIRING_CODE_LIFETIME = timedelta(minutes=10)
MAX_PAIRING_ATTEMPTS = 5
LAST_SEEN_EVERY = timedelta(minutes=1)
# A phone nobody has used for this long has to be paired again (a lost or retired phone doesn't stay trusted forever).
DEVICE_IDLE_LIFETIME = timedelta(days=90)
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I to misread

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _now() -> datetime:
    return datetime.utcnow()


def default_dir() -> str:
    """Where the certificate, its key and the on/off setting live: next to
    the database in an installed app, config/lan/ (gitignored) in dev."""
    data_dir = os.getenv("SANDVELD_DATA_DIR")
    return os.path.join(data_dir, "lan") if data_dir else os.path.join(_PROJECT_ROOT, "config", "lan")


def load_settings(directory: str) -> dict:
    try:
        with open(os.path.join(directory, "settings.json")) as f:
            stored = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        stored = {}
    port = stored.get("port")
    return {"enabled": stored.get("enabled") is True,
            "port": port if isinstance(port, int) and 1024 <= port <= 65535 else DEFAULT_PORT}


def save_settings(directory: str, settings: dict) -> None:
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, "settings.json"), "w") as f:
        json.dump({"enabled": bool(settings.get("enabled")), "port": settings.get("port", DEFAULT_PORT)}, f)


def ensure_certificate(directory: str) -> tuple:
    """(cert path, key path, SHA-256 fingerprint hex) - made once, then kept,
    so paired phones keep trusting this PC."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    cert_path, key_path = os.path.join(directory, "cert.pem"), os.path.join(directory, "key.pem")
    if not (os.path.exists(cert_path) and os.path.exists(key_path)):
        # Owner-only from the moment the key exists (on Windows the real
        # protection is the per-user %APPDATA% folder the data dir sits in).
        os.makedirs(directory, mode=0o700, exist_ok=True)
        key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Sandveld Vee Dienste office PC")])
        now = datetime.now(timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=3650))
                .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                .sign(key, hashes.SHA256()))
        # Not passphrase-protected: the server must load it unattended, so the
        # passphrase would have to sit right next to it.
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_BINARY", 0), 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                      serialization.NoEncryption()))
        with open(cert_path, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open(cert_path, "rb") as f:
        cert = x509.load_pem_x509_certificate(f.read())
    return cert_path, key_path, cert.fingerprint(hashes.SHA256()).hex()


def local_addresses() -> list:
    """This PC's IPv4 addresses a phone could use, the likely one first."""
    found = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # picks the outgoing interface; sends nothing
            found.append(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.append(info[4][0])
    except OSError:
        pass
    return [a for a in dict.fromkeys(found) if not a.startswith(("127.", "169.254.", "0."))]


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _normalise(code: str) -> str:
    return "".join(ch for ch in (code or "").upper() if ch.isalnum())


class PairingCodes:
    """One pairing code at a time, valid for PAIRING_CODE_LIFETIME and a
    single use. Wrong guesses count against it; too many and it's gone."""

    def __init__(self):
        self._lock = threading.Lock()
        self._code = None
        self._expires = None
        self._misses = 0

    def create(self) -> dict:
        raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        with self._lock:
            self._code, self._expires, self._misses = raw, _now() + PAIRING_CODE_LIFETIME, 0
        return {"code": f"{raw[:4]}-{raw[4:]}", "expires_at": self._expires}

    def consume(self, code: str) -> bool:
        guess = _normalise(code)
        with self._lock:
            if self._code is None or self._expires <= _now():
                self._code = None
                return False
            if hmac.compare_digest(guess.encode(), self._code.encode()):
                self._code = None
                return True
            self._misses += 1
            if self._misses >= MAX_PAIRING_ATTEMPTS:
                self._code = None
            return False


class DeviceGuard:
    """ASGI wrapper for the phone listener: every request needs a paired
    phone's token (except the pairing call), and is marked via_lan so
    PC-only endpoints can refuse it (see api/devices.require_local)."""

    def __init__(self, app, session_factory=None):
        self.app = app
        self._session_factory = session_factory

    def _sessions(self):
        if self._session_factory:
            return self._session_factory()
        from sqlmodel import Session
        from app.core import db
        return Session(db.engine)

    def _check(self, token: str):
        from sqlmodel import select
        from app.models.device import PairedDevice
        with self._sessions() as session:
            device = session.exec(select(PairedDevice).where(PairedDevice.token_hash == hash_token(token))).first()
            if device is None:
                return False
            if _now() - (device.last_seen_at or device.created_at) > DEVICE_IDLE_LIFETIME:
                session.delete(device)
                session.commit()
                return False
            if device.last_seen_at is None or _now() - device.last_seen_at > LAST_SEEN_EVERY:
                device.last_seen_at = _now()
                session.add(device)
                session.commit()
            return True

    @staticmethod
    def _with_origin(send):
        async def wrapped(message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"access-control-allow-origin"]
                headers += [(b"access-control-allow-origin", APP_ORIGIN), (b"access-control-expose-headers", CORS_EXPOSE.encode()),
                            (b"vary", b"Origin")]
                message = {**message, "headers": headers}
            await send(message)
        return wrapped

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        scope.setdefault("state", {})["via_lan"] = True
        if scope["type"] == "http" and dict(scope.get("headers") or []).get(b"origin") == APP_ORIGIN:
            if scope.get("method") == "OPTIONS":
                preflight = Response(status_code=204, headers={
                    "access-control-allow-origin": APP_ORIGIN.decode(), "access-control-allow-methods": CORS_METHODS,
                    "access-control-allow-headers": CORS_HEADERS, "access-control-max-age": "600", "vary": "Origin"})
                return await preflight(scope, receive, send)
            send = self._with_origin(send)
        if (scope.get("method"), scope.get("path")) not in OPEN_PATHS:
            token = dict(scope.get("headers") or []).get(DEVICE_HEADER.encode(), b"").decode("latin-1")
            if not token or not await run_in_threadpool(self._check, token):
                response = JSONResponse({"detail": "This phone isn't paired with the office PC"}, status_code=401)
                return await response(scope, receive, send)
        return await self.app(scope, receive, send)


class LanServer:
    """The phone listener, run in a background thread next to the main
    server so it can be switched on and off without restarting the app."""

    def __init__(self):
        self._server = None
        self._thread = None
        self.error = None
        self.port = None

    @property
    def running(self) -> bool:
        return bool(self._server and self._server.started and self._thread and self._thread.is_alive())

    def start(self, app, directory: str, port: int = DEFAULT_PORT, wait: float = 5.0) -> bool:
        import uvicorn
        self.stop()
        self.error, self.port = None, port
        try:
            cert, key, _ = ensure_certificate(directory)
        except Exception as exc:  # e.g. the data folder isn't writable
            self.error = f"Couldn't make the security certificate: {exc}"
            return False
        config = uvicorn.Config(DeviceGuard(app), host="0.0.0.0", port=port, ssl_certfile=cert, ssl_keyfile=key,
                                lifespan="off", log_level="warning", access_log=False)
        server = uvicorn.Server(config)

        def run():
            try:
                server.run()
            except BaseException as exc:  # uvicorn exits via SystemExit when the port is taken
                logger.error("Phone listener stopped: %r", exc)
            if not server.started:
                self.error = f"Couldn't open port {port} - is another program using it?"

        self._server = server
        self._thread = threading.Thread(target=run, name="sandveld-phones", daemon=True)
        self._thread.start()
        deadline = time.monotonic() + wait
        while time.monotonic() < deadline and self._thread.is_alive() and not server.started:
            time.sleep(0.05)
        if not self.running and not self.error:
            self.error = f"The phone connection didn't start on port {port}"
        return self.running

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._server = self._thread = None
