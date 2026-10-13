"""Traffic that arrives through the relay is treated exactly like phone traffic on the Wi-Fi: it lands on the phone
listener (behind DeviceGuard), so it needs a paired device's token and is refused on PC-only routes - even though the
agent hands it to the listener from 127.0.0.1. Authorization is by listener (the via_lan marker), never by source address.
End to end: a real relay, the real agent and the real phone listener (LanServer)."""
import asyncio
import socket
import ssl
import tempfile
import threading
import time
import unittest
from unittest import mock

from fastapi import Depends, FastAPI
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.api import devices
from app.core import db, lan, relay_agent
from app.core.security import hash_secret  # noqa: F401 - registers user table dependencies
from app.models.device import PairedDevice
from relay.server import RelayServer


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class RelayedRequestsAreStillPhoneRequests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(self.engine)
        self.token = "t" * 40
        with Session(self.engine) as s:
            s.add(PairedDevice(name="Test phone", token_hash=lan.hash_token(self.token)))
            s.commit()
        patcher = mock.patch.object(db, "engine", self.engine)  # DeviceGuard looks tokens up here
        patcher.start()
        self.addCleanup(patcher.stop)

        app = FastAPI()

        @app.get("/version")
        def version():
            return {"ok": True}

        @app.get("/local-only", dependencies=[Depends(devices.require_local)])
        def local_only():
            return {"secret": "only the PC itself may see this"}

        self.listener_port = free_port()
        self.lan = lan.LanServer()
        self.cert_dir = tempfile.mkdtemp()
        self.assertTrue(self.lan.start(app, self.cert_dir, self.listener_port))
        self.addCleanup(self.lan.stop)

        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self.loop.run_forever, daemon=True).start()
        self.addCleanup(lambda: self.loop.call_soon_threadsafe(self.loop.stop))
        self.relay = RelayServer(rate_limit=1000)
        self.server = asyncio.run_coroutine_threadsafe(asyncio.start_server(self.relay.handle, "127.0.0.1", 0), self.loop).result(5)
        self.relay_port = self.server.sockets[0].getsockname()[1]
        self.identity = relay_agent.load_identity(tempfile.mkdtemp())
        self.agent = relay_agent.RelayAgent()
        self.agent.start("127.0.0.1", self.relay_port, self.listener_port, self.identity)
        self.addCleanup(self.agent.stop)
        end = time.time() + 5
        while time.time() < end and not self.agent.status()["connected"]:
            time.sleep(0.05)
        self.assertTrue(self.agent.status()["connected"])

    async def _get(self, path, token=None):
        reader, writer = await asyncio.open_connection("127.0.0.1", self.relay_port)
        writer.write(f"PHONE {self.identity.office} {self.identity.phone_key}\n".encode())
        await writer.drain()
        assert (await asyncio.wait_for(reader.readline(), 5)).strip() == b"READY"
        # Like the real phone: no certificate authority, the PC's own certificate is recognised by its pinned fingerprint.
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        await writer.start_tls(context, server_hostname="office-pc")
        import hashlib
        seen = hashlib.sha256(writer.get_extra_info("ssl_object").getpeercert(binary_form=True)).hexdigest()
        assert seen == lan.ensure_certificate(self.cert_dir)[2], "this is not the PC's certificate"
        header = f"X-Device-Token: {token}\r\n" if token else ""
        writer.write(f"GET {path} HTTP/1.1\r\nHost: office-pc\r\n{header}Connection: close\r\n\r\n".encode())
        await writer.drain()
        raw = await asyncio.wait_for(reader.read(65536), 10)
        writer.close()
        return int(raw.split(b" ", 2)[1]), raw

    def get(self, path, token=None):
        return asyncio.run_coroutine_threadsafe(self._get(path, token), self.loop).result(20)

    def test_without_a_paired_phones_token_nothing_gets_through_the_relay(self):
        self.assertEqual(self.get("/version")[0], 401)
        self.assertEqual(self.get("/local-only")[0], 401)
        self.assertEqual(self.get("/version", token="wrong" * 8)[0], 401)

    def test_a_paired_phone_gets_through_to_ordinary_routes(self):
        self.assertEqual(self.get("/version", self.token)[0], 200)

    def test_even_a_paired_phone_is_refused_on_pc_only_routes_because_it_arrived_through_the_phone_listener(self):
        status, raw = self.get("/local-only", self.token)
        self.assertEqual(status, 403)
        self.assertNotIn(b"only the PC itself", raw)

    def test_the_agent_only_ever_forwards_to_the_phone_listener_never_the_desktop_backend(self):
        import inspect
        source = inspect.getsource(relay_agent.RelayAgent._tunnel)
        self.assertIn("listener_port", source)
        self.assertNotIn("8000", source)
        # and devices.apply_relay hands it the phone listener's port
        with mock.patch.object(devices, "RELAY", mock.Mock()), mock.patch.object(devices, "SERVER", mock.Mock(running=True)), \
             mock.patch.object(lan, "default_dir", return_value=tempfile.mkdtemp()):
            relay_agent.save_relay_settings(lan.default_dir(), True, "relay.example.com", 8447)
            lan.save_settings(lan.default_dir(), {"enabled": True, "port": 8443})
            devices.apply_relay()
            self.assertEqual(devices.RELAY.start.call_args[0][2], 8443)


if __name__ == "__main__":
    unittest.main()
