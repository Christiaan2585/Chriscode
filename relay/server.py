"""The connection relay: lets a phone reach an office PC that it cannot reach directly (a different Wi-Fi point, mobile
data, another town) without anyone installing or signing in to anything.

The office PC keeps ONE outbound connection open to this server (so no router settings are needed). When a phone
arrives, the relay tells the PC, the PC opens a second outbound connection for that phone, and the relay joins the two.
What passes through is TLS between the phone and the PC (the phone checks the PC's certificate fingerprint), so the relay
only ever carries bytes it cannot read, and it keeps no data.

Protocol - one text line, then raw bytes:
  PC    <office> <pc_secret> <phone_key_hash>   register the PC's control connection        -> OK | DENIED | BUSY
        relay -> PC afterwards:  PING            (the PC answers PONG)      OPEN <session>   (a phone is waiting)
  DATA  <office> <pc_secret> <session>          the PC's answer to OPEN: this is that phone's pipe
  PHONE <office> <phone_key>                    a phone wants the PC                        -> READY | OFFLINE | TIMEOUT | BUSY
<office> is 32 hex characters, secrets and keys 64 hex. The first PC to register an office owns it (its secret); a phone
needs the key whose SHA-256 the PC registered. Run: python -m relay.server --port 8447 [--cert fullchain.pem --key key.pem]
"""
import argparse
import asyncio
import hashlib
import hmac
import logging
import re
import secrets
import ssl
import time
from collections import defaultdict, deque

log = logging.getLogger("relay")

MAX_LINE = 256
_OFFICE = re.compile(r"[0-9a-f]{32}")
_SECRET = re.compile(r"[0-9a-f]{64}")
_SESSION = re.compile(r"[0-9a-f]{32}")


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


class _Office:
    def __init__(self, secret_hash: str, key_hash: str):
        self.secret_hash = secret_hash
        self.key_hash = key_hash
        self.control = None  # the PC's control StreamWriter while it is connected
        self.last_pong = time.monotonic()
        self.pending = {}  # session -> _Waiting


class _Waiting:
    def __init__(self, loop):
        self.data = loop.create_future()  # (reader, writer) of the PC's data connection
        self.done = loop.create_future()  # set when the tunnel has ended, so the DATA handler can return


class RelayServer:
    def __init__(self, pending_timeout=10.0, handshake_timeout=8.0, rate_limit=20, rate_window=60.0, max_pending=8,
                 max_active=5000, max_offices=10000, idle_timeout=900.0, ping_interval=25.0, max_per_ip=60):
        self.pending_timeout = pending_timeout
        self.handshake_timeout = handshake_timeout
        self.rate_limit = rate_limit  # failed handshakes per address per window before it is turned away
        self.rate_window = rate_window
        self.max_pending = max_pending
        self.max_active = max_active
        self.max_offices = max_offices
        self.idle_timeout = idle_timeout
        self.ping_interval = ping_interval
        self.max_per_ip = max_per_ip
        self.offices = {}
        self.active = 0
        self._failures = defaultdict(deque)
        self._open_by_ip = defaultdict(int)
        self._writers = set()
        self._tasks = set()

    # --- helpers ---

    def _too_many_failures(self, ip: str) -> bool:
        recent = self._failures[ip]
        cutoff = time.monotonic() - self.rate_window
        while recent and recent[0] < cutoff:
            recent.popleft()
        if not recent:
            self._failures.pop(ip, None)
            return False
        return len(recent) >= self.rate_limit

    def _failed(self, ip: str) -> None:
        self._failures[ip].append(time.monotonic())

    @staticmethod
    async def _say(writer, text: str) -> None:
        try:
            writer.write(text.encode() + b"\n")
            await writer.drain()
        except Exception:
            pass

    @staticmethod
    def _close(writer) -> None:
        try:
            writer.close()
        except Exception:
            pass

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        for writer in list(self._writers):
            self._close(writer)
        await asyncio.sleep(0)

    # --- one connection ---

    async def handle(self, reader, writer) -> None:
        peer = writer.get_extra_info("peername")
        ip = peer[0] if peer else "?"
        self._writers.add(writer)
        task = asyncio.current_task()
        self._tasks.add(task)
        self._open_by_ip[ip] += 1
        keep_open = False
        try:
            if self._too_many_failures(ip) or self._open_by_ip[ip] > self.max_per_ip:
                await self._say(writer, "BUSY")
                return
            try:
                raw = await asyncio.wait_for(reader.readuntil(b"\n"), self.handshake_timeout)
                if len(raw) > MAX_LINE:
                    raise ValueError("too long")
                parts = raw.decode("ascii").split()
            except (asyncio.TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError, UnicodeDecodeError, ValueError, ConnectionError):
                self._failed(ip)
                return
            kind = parts[0] if parts else ""
            if kind == "PC" and len(parts) == 4:
                keep_open = await self._pc(reader, writer, ip, *parts[1:])
            elif kind == "DATA" and len(parts) == 4:
                await self._data(reader, writer, ip, *parts[1:])
            elif kind == "PHONE" and len(parts) == 3:
                await self._phone(reader, writer, ip, *parts[1:])
            else:
                self._failed(ip)
        except asyncio.CancelledError:
            pass
        except Exception:  # one bad connection must never take the server down
            log.exception("connection error")
        finally:
            self._open_by_ip[ip] -= 1
            if self._open_by_ip[ip] <= 0:
                self._open_by_ip.pop(ip, None)
            self._tasks.discard(task)
            if not keep_open:
                self._close(writer)
                self._writers.discard(writer)

    # --- the PC's control connection ---

    async def _pc(self, reader, writer, ip, office_id, pc_secret, key_hash) -> bool:
        if not (_OFFICE.fullmatch(office_id) and _SECRET.fullmatch(pc_secret) and _SECRET.fullmatch(key_hash)):
            self._failed(ip)
            return False
        office = self.offices.get(office_id)
        if office is None:
            if len(self.offices) >= self.max_offices:
                await self._say(writer, "BUSY")
                return False
            office = self.offices[office_id] = _Office(_sha(pc_secret), key_hash)
        elif not hmac.compare_digest(office.secret_hash, _sha(pc_secret)):
            self._failed(ip)
            await self._say(writer, "DENIED")
            return False
        old = office.control
        office.control, office.key_hash, office.last_pong = writer, key_hash, time.monotonic()
        if old is not None and old is not writer:
            self._close(old)
        await self._say(writer, "OK")
        pinger = asyncio.ensure_future(self._ping(office, writer))
        try:
            while True:
                said = await reader.readline()
                if not said:
                    break
                if said.strip() == b"PONG":
                    office.last_pong = time.monotonic()
        except (ConnectionError, asyncio.CancelledError):
            pass
        finally:
            pinger.cancel()
            if office.control is writer:
                office.control = None
                for waiting in office.pending.values():
                    if not waiting.data.done():
                        waiting.data.set_result(None)
            self._close(writer)
            self._writers.discard(writer)
        return True

    async def _ping(self, office, writer) -> None:
        try:
            while True:
                await asyncio.sleep(self.ping_interval)
                if time.monotonic() - office.last_pong > self.ping_interval * 3:
                    self._close(writer)  # the PC went silent
                    return
                writer.write(b"PING\n")
                await writer.drain()
        except Exception:
            self._close(writer)

    # --- the PC's answer to "a phone is waiting" ---

    async def _data(self, reader, writer, ip, office_id, pc_secret, session) -> None:
        office = self.offices.get(office_id)
        waiting = office.pending.get(session) if office and _SESSION.fullmatch(session) else None
        if (office is None or waiting is None or not _SECRET.fullmatch(pc_secret) or waiting.data.done()
                or not hmac.compare_digest(office.secret_hash, _sha(pc_secret))):
            self._failed(ip)
            await self._say(writer, "DENIED")
            return
        waiting.data.set_result((reader, writer))
        await waiting.done  # the phone's handler runs the tunnel; this one just stays until it is over

    # --- a phone arriving ---

    async def _phone(self, reader, writer, ip, office_id, phone_key) -> None:
        office = self.offices.get(office_id) if _OFFICE.fullmatch(office_id) else None
        if (office is None or office.control is None or not _SECRET.fullmatch(phone_key)
                or not hmac.compare_digest(office.key_hash, _sha(phone_key))):
            self._failed(ip)
            await self._say(writer, "OFFLINE")  # the same answer whether the office is unknown or the key is wrong
            return
        if len(office.pending) >= self.max_pending or self.active >= self.max_active:
            await self._say(writer, "BUSY")
            return
        session = secrets.token_hex(16)
        waiting = office.pending[session] = _Waiting(asyncio.get_running_loop())
        try:
            try:
                office.control.write(f"OPEN {session}\n".encode())
                await office.control.drain()
            except Exception:
                await self._say(writer, "OFFLINE")
                return
            try:
                pc = await asyncio.wait_for(asyncio.shield(waiting.data), self.pending_timeout)
            except asyncio.TimeoutError:
                await self._say(writer, "TIMEOUT")
                return
            if pc is None:
                await self._say(writer, "OFFLINE")
                return
            pc_reader, pc_writer = pc
            self._writers.add(pc_writer)
            await self._say(writer, "READY")
            self.active += 1
            try:
                await self._pipe(reader, writer, pc_reader, pc_writer)
            finally:
                self.active -= 1
                self._close(pc_writer)
                self._writers.discard(pc_writer)
        finally:
            office.pending.pop(session, None)
            if not waiting.done.done():
                waiting.done.set_result(None)

    async def _pipe(self, a_reader, a_writer, b_reader, b_writer) -> None:
        async def copy(source, target):
            try:
                while True:
                    data = await asyncio.wait_for(source.read(65536), self.idle_timeout)
                    if not data:
                        return
                    target.write(data)
                    await target.drain()
            except Exception:
                return

        tasks = [asyncio.ensure_future(copy(a_reader, b_writer)), asyncio.ensure_future(copy(b_reader, a_writer))]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)  # either side hanging up ends the tunnel
        finally:
            for task in tasks:
                task.cancel()
            self._close(a_writer)
            self._close(b_writer)


async def serve(host: str, port: int, cert: str = None, key: str = None) -> None:
    relay = RelayServer()
    context = None
    if cert and key:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(cert, key)
    server = await asyncio.start_server(relay.handle, host, port, ssl=context, limit=2 ** 16)
    log.info("relay listening on %s:%s (%s)", host, port, "TLS" if context else "plain TCP - put TLS in front of it")
    async with server:
        await server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Connection relay for Sandveld Vee Dienste phones")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8447)
    parser.add_argument("--cert", help="TLS certificate chain (PEM); with --key the relay speaks TLS itself")
    parser.add_argument("--key", help="TLS private key (PEM)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    asyncio.run(serve(args.host, args.port, args.cert, args.key))


if __name__ == "__main__":
    main()
