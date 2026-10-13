"""The office PC's side of the connection relay (see relay/server.py): keeps ONE outbound connection to the relay open -
no router settings, nothing for the customer to install - and, when the relay says a phone is waiting, opens a second
outbound connection for it and carries the bytes to the phone listener on this PC (app/core/lan.py). The bytes are TLS
between the phone and that listener (the phone pins its certificate), so neither the relay nor this agent can read them.

The identity (office id, the PC's secret, the key phones need) is made once and kept encrypted next to the listener's
certificate. The relay is told only the SHA-256 of the phone key."""
import asyncio
import hashlib
import ipaddress
import json
import logging
import os
import re
import secrets
import ssl
import threading
from dataclasses import dataclass

from app.core import field_crypto

log = logging.getLogger("uvicorn.error")

DEFAULT_RELAY_PORT = 8447
IDENTITY_FILE = "relay.json"
_LABEL = re.compile(r"[a-z0-9]([a-z0-9-]*[a-z0-9])?")


@dataclass
class Identity:
    office: str
    pc_secret: str
    phone_key: str

    @property
    def phone_key_hash(self) -> str:
        return hashlib.sha256(self.phone_key.encode()).hexdigest()


def identity_file(directory: str) -> str:
    return os.path.join(directory, IDENTITY_FILE)


def _write(directory: str, identity: Identity) -> None:
    os.makedirs(directory, exist_ok=True)
    path = identity_file(directory)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump({"office": identity.office, "pc_secret": field_crypto.encrypt(identity.pc_secret),
                   "phone_key": field_crypto.encrypt(identity.phone_key)}, f)
    os.replace(path + ".tmp", path)


def load_identity(directory: str) -> Identity:
    """The identity, made on first use. If it can't be read (the folder came from another PC) a new one is made:
    phones then learn the new one the next time they reach this PC."""
    try:
        with open(identity_file(directory), encoding="utf-8") as f:
            stored = json.load(f)
        return Identity(stored["office"], field_crypto.decrypt(stored["pc_secret"]), field_crypto.decrypt(stored["phone_key"]))
    except (FileNotFoundError, KeyError, ValueError, TypeError, field_crypto.Unreadable):
        identity = Identity(secrets.token_hex(16), secrets.token_hex(32), secrets.token_hex(32))
        _write(directory, identity)
        return identity


def rotate_phone_key(directory: str) -> Identity:
    """A whole new identity (office id, PC secret and phone key): a phone that was removed or lost knew the old office
    id and key, and with them could neither use the relay nor claim the office for itself. Phones still paired learn
    the new details the next time they reach the PC."""
    fresh = Identity(secrets.token_hex(16), secrets.token_hex(32), secrets.token_hex(32))
    _write(directory, fresh)
    return fresh


def parse_relay(text: str) -> tuple:
    """"relay.example.com" or "relay.example.com:8447" -> (host, port). Raises ValueError for anything else."""
    value = (text or "").strip().lower()
    port = DEFAULT_RELAY_PORT
    if ":" in value:
        value, _, port_text = value.rpartition(":")
        if not port_text.isdigit() or not 1 <= int(port_text) <= 65535:
            raise ValueError("The port must be a number from 1 to 65535")
        port = int(port_text)
    if not value or len(value) > 253:
        raise ValueError("Enter the relay's address, for example relay.example.com")
    try:
        ipaddress.IPv4Address(value)
        return value, port
    except ValueError:
        pass
    if not all(_LABEL.fullmatch(label) for label in value.split(".")):
        raise ValueError("That is not a valid address")
    return value, port


def needs_tls(host: str) -> bool:
    """The connection to the relay is encrypted unless the relay is on this PC or the office network (testing)."""
    if host == "localhost":
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return True
    return not (address.is_loopback or address.is_private)


class RelayAgent:
    """Runs in its own thread with its own event loop, next to the phone listener (LanServer)."""

    def __init__(self):
        self._thread = None
        self._loop = None
        self._lock = threading.Lock()
        self._state = {"connected": False, "error": None}

    def status(self) -> dict:
        with self._lock:
            return dict(self._state)

    def _set(self, connected: bool, error=None) -> None:
        with self._lock:
            self._state = {"connected": connected, "error": error}

    def start(self, host: str, port: int, listener_port: int, identity: Identity, tls=None, ca_file=None) -> None:
        self.stop()
        use_tls = needs_tls(host) if tls is None else tls
        self._set(False, None)
        self._thread = threading.Thread(target=self._run, args=(host, port, listener_port, identity, use_tls, ca_file), daemon=True, name="relay-agent")
        self._thread.start()

    def stop(self) -> None:
        thread, loop = self._thread, self._loop
        self._thread = self._loop = None
        if loop is not None:
            loop.call_soon_threadsafe(lambda: [t.cancel() for t in asyncio.all_tasks(loop)])
        if thread is not None:
            thread.join(3)
        self._set(False, None)

    def _run(self, host, port, listener_port, identity, use_tls, ca_file=None) -> None:
        loop = self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._main(host, port, listener_port, identity, use_tls, ca_file))
        except asyncio.CancelledError:
            pass
        finally:
            loop.close()

    async def _main(self, host, port, listener_port, identity, use_tls, ca_file=None) -> None:
        context = ssl.create_default_context(cafile=ca_file) if use_tls else None  # ca_file: tests only
        delay = 1.0
        while True:
            try:
                await self._control(host, port, listener_port, identity, context)
                delay = 1.0  # it worked for a while, then dropped: try again soon
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._set(False, _describe(exc))
            else:
                self._set(False, None)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30.0)

    async def _control(self, host, port, listener_port, identity, context) -> None:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port, ssl=context), 10)
        tunnels = set()
        try:
            writer.write(f"PC {identity.office} {identity.pc_secret} {identity.phone_key_hash}\n".encode())
            await writer.drain()
            answer = (await asyncio.wait_for(reader.readline(), 8)).decode().strip()
            if answer == "DENIED":
                raise RelayRefused("The relay refused this PC - another PC is already using its ID there")
            if answer == "BUSY":
                raise RelayRefused("The relay is busy right now - it will try again")
            if answer != "OK":
                raise RelayRefused("That address does not answer like a Sandveld relay")
            self._set(True, None)
            while True:
                said = (await asyncio.wait_for(reader.readline(), 90)).decode().strip()
                if not said:
                    return
                if said == "PING":
                    writer.write(b"PONG\n")
                    await writer.drain()
                elif said.startswith("OPEN "):
                    task = asyncio.ensure_future(self._tunnel(host, port, listener_port, identity, context, said.split()[1]))
                    tunnels.add(task)
                    task.add_done_callback(tunnels.discard)
        finally:
            writer.close()
            for task in tunnels:
                task.cancel()

    async def _tunnel(self, host, port, listener_port, identity, context, session) -> None:
        """One phone: open the local connection first, then the relay's data connection for it, and join them."""
        local_writer = relay_writer = None
        try:
            try:
                local_reader, local_writer = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", listener_port), 3)
            except Exception:
                local_reader = None  # the listener is down: still answer the relay, then hang up so the phone is not left waiting
            relay_reader, relay_writer = await asyncio.wait_for(asyncio.open_connection(host, port, ssl=context), 10)
            relay_writer.write(f"DATA {identity.office} {identity.pc_secret} {session}\n".encode())
            await relay_writer.drain()
            if local_reader is None:
                return
            await _join(local_reader, local_writer, relay_reader, relay_writer)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.debug("relay tunnel ended", exc_info=True)
        finally:
            for writer in (local_writer, relay_writer):
                if writer is not None:
                    writer.close()


class RelayRefused(Exception):
    pass


def _describe(exc: Exception) -> str:
    if isinstance(exc, RelayRefused):
        return str(exc)
    if isinstance(exc, ssl.SSLError):
        return "The relay's certificate could not be checked"
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "The relay did not answer in time"
    if isinstance(exc, (ConnectionError, OSError)):
        return "The relay could not be reached - check its address and this PC's internet connection"
    return "The connection to the relay failed"


async def _join(a_reader, a_writer, b_reader, b_writer) -> None:
    async def copy(source, target):
        try:
            while True:
                data = await source.read(65536)
                if not data:
                    return
                target.write(data)
                await target.drain()
        except Exception:
            return

    tasks = [asyncio.ensure_future(copy(a_reader, b_writer)), asyncio.ensure_future(copy(b_reader, a_writer))]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()


# --- the on/off switch and the relay's address, kept next to the phone listener's own settings ---

SETTINGS_FILE = "relay-settings.json"


def settings_file(directory: str) -> str:
    return os.path.join(directory, SETTINGS_FILE)


def load_relay_settings(directory: str) -> dict:
    try:
        with open(settings_file(directory), encoding="utf-8") as f:
            stored = json.load(f)
        host, port = parse_relay(f"{stored.get('host')}:{stored.get('port')}") if stored.get("host") else (None, DEFAULT_RELAY_PORT)
        return {"enabled": stored.get("enabled") is True and host is not None, "host": host, "port": port}
    except (FileNotFoundError, ValueError, TypeError, AttributeError):
        return {"enabled": False, "host": None, "port": DEFAULT_RELAY_PORT}


def save_relay_settings(directory: str, enabled: bool, host, port: int) -> None:
    os.makedirs(directory, exist_ok=True)
    with open(settings_file(directory) + ".tmp", "w", encoding="utf-8") as f:
        json.dump({"enabled": bool(enabled), "host": host, "port": port}, f)
    os.replace(settings_file(directory) + ".tmp", settings_file(directory))
