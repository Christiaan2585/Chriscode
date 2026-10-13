"""The PC's relay agent: it keeps one outbound connection to the relay and, for each phone that arrives, carries the bytes
to the phone listener on this PC. Tested against the real relay and a stand-in listener that just echoes."""
import asyncio
import hashlib
import tempfile
import threading
import time
import unittest

from app.core import relay_agent
from relay.server import RelayServer


def wait_for(check, seconds=5.0):
    end = time.time() + seconds
    while time.time() < end:
        if check():
            return True
        time.sleep(0.05)
    return False


class IdentityTests(unittest.TestCase):
    def test_the_ids_are_made_once_kept_and_unguessable(self):
        folder = tempfile.mkdtemp()
        a = relay_agent.load_identity(folder)
        b = relay_agent.load_identity(folder)
        self.assertEqual((a.office, a.pc_secret, a.phone_key), (b.office, b.pc_secret, b.phone_key))
        self.assertRegex(a.office, r"^[0-9a-f]{32}$")
        self.assertRegex(a.pc_secret, r"^[0-9a-f]{64}$")
        self.assertRegex(a.phone_key, r"^[0-9a-f]{64}$")
        self.assertEqual(len({a.office, a.pc_secret, a.phone_key}), 3)

    def test_the_secrets_are_not_written_in_the_clear(self):
        folder = tempfile.mkdtemp()
        identity = relay_agent.load_identity(folder)
        with open(relay_agent.identity_file(folder), encoding="utf-8") as f:
            text = f.read()
        self.assertNotIn(identity.pc_secret, text)
        self.assertNotIn(identity.phone_key, text)

    def test_a_new_phone_key_locks_out_the_old_one_but_keeps_the_office(self):
        folder = tempfile.mkdtemp()
        before = relay_agent.load_identity(folder)
        after = relay_agent.rotate_phone_key(folder)
        self.assertEqual(after.office, before.office)
        self.assertNotEqual(after.phone_key, before.phone_key)
        self.assertEqual(relay_agent.load_identity(folder).phone_key, after.phone_key)

    def test_the_phone_key_is_registered_with_the_relay_only_as_a_hash(self):
        identity = relay_agent.load_identity(tempfile.mkdtemp())
        self.assertEqual(identity.phone_key_hash, hashlib.sha256(identity.phone_key.encode()).hexdigest())


class AddressTests(unittest.TestCase):
    def test_a_relay_address_is_read_with_or_without_a_port(self):
        self.assertEqual(relay_agent.parse_relay("relay.example.com"), ("relay.example.com", 8447))
        self.assertEqual(relay_agent.parse_relay("  Relay.Example.com:443 "), ("relay.example.com", 443))
        self.assertEqual(relay_agent.parse_relay("192.168.1.9:9000"), ("192.168.1.9", 9000))

    def test_anything_that_is_not_a_host_and_port_is_refused(self):
        for bad in ("", "http://relay.example.com", "relay.example.com:0", "relay.example.com:99999", "bad host", "a/b", "relay..com", "x@y.com:1", "-x.com"):
            with self.assertRaises(ValueError, msg=bad):
                relay_agent.parse_relay(bad)

    def test_encryption_to_the_relay_is_required_except_on_this_pc_or_the_office_network(self):
        self.assertTrue(relay_agent.needs_tls("relay.example.com"))
        self.assertTrue(relay_agent.needs_tls("8.8.8.8"))
        self.assertFalse(relay_agent.needs_tls("127.0.0.1"))
        self.assertFalse(relay_agent.needs_tls("192.168.1.9"))
        self.assertFalse(relay_agent.needs_tls("10.0.0.5"))
        self.assertFalse(relay_agent.needs_tls("localhost"))


class AgentCase(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()
        self.relay = RelayServer(pending_timeout=3.0, handshake_timeout=2.0, rate_limit=1000, ping_interval=0.3)
        self.listener_port = self.run_async(self.start_listener())
        self.relay_server = self.run_async(asyncio.start_server(self.relay.handle, "127.0.0.1", 0))
        self.relay_port = self.relay_server.sockets[0].getsockname()[1]
        self.identity = relay_agent.load_identity(tempfile.mkdtemp())
        self.agent = relay_agent.RelayAgent()

    async def _cleanup(self):
        self.relay_server.close()
        self.listener.close()
        for task in asyncio.all_tasks():
            if task is not asyncio.current_task():
                task.cancel()
        await asyncio.sleep(0.05)

    def tearDown(self):
        self.agent.stop()
        self.run_async(self.relay.close())
        self.run_async(self._cleanup())
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(3)

    def run_async(self, coro, timeout=5):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)

    async def start_listener(self):
        async def echo(reader, writer):  # stands in for the phone listener: answers "echo:" + what it was sent
            try:
                while True:
                    data = await reader.read(4096)
                    if not data:
                        break
                    writer.write(b"echo:" + data)
                    await writer.drain()
            finally:
                writer.close()
        self.listener = await asyncio.start_server(echo, "127.0.0.1", 0)
        return self.listener.sockets[0].getsockname()[1]

    def start_agent(self, **override):
        self.agent.start("127.0.0.1", self.relay_port, self.listener_port, self.identity, **override)
        self.assertTrue(wait_for(lambda: self.agent.status()["connected"]), self.agent.status())

    async def phone_says(self, payload, key=None, wait=3):
        reader, writer = await asyncio.open_connection("127.0.0.1", self.relay_port)
        try:
            writer.write(f"PHONE {self.identity.office} {key or self.identity.phone_key}\n".encode())
            await writer.drain()
            first = (await asyncio.wait_for(reader.readline(), wait)).decode().strip()
            if first != "READY":
                return first
            writer.write(payload)
            await writer.drain()
            try:
                return await asyncio.wait_for(reader.readexactly(5 + len(payload)), wait)
            except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError):
                return "closed"
        finally:
            writer.close()


def _self_signed(folder, name="127.0.0.1"):
    """A throwaway certificate for `name` (an IP address here), as a relay with a real certificate would present."""
    import datetime
    import ipaddress
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID
    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test relay")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=30))
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address(name))]), critical=False)
            .sign(key, hashes.SHA256()))
    cert_path, key_path = folder + "/relay-cert.pem", folder + "/relay-key.pem"
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    return cert_path, key_path


class TlsToTheRelayTests(AgentCase):
    """With a real relay the hop is encrypted and its certificate is checked - the secrets must not travel in the clear."""

    def setUp(self):
        super().setUp()
        import ssl
        self.folder = tempfile.mkdtemp()
        self.cert, key = _self_signed(self.folder)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(self.cert, key)
        self.run_async(self._swap_server(context))

    async def _swap_server(self, context):
        self.relay_server.close()
        self.relay_server = await asyncio.start_server(self.relay.handle, "127.0.0.1", 0, ssl=context)
        self.relay_port = self.relay_server.sockets[0].getsockname()[1]

    def test_the_agent_registers_over_tls_when_the_certificate_is_one_it_trusts(self):
        self.agent.start("127.0.0.1", self.relay_port, self.listener_port, self.identity, tls=True, ca_file=self.cert)
        self.assertTrue(wait_for(lambda: self.agent.status()["connected"]), self.agent.status())

    def test_and_a_phone_gets_through_to_the_listener_over_it(self):
        import ssl
        self.agent.start("127.0.0.1", self.relay_port, self.listener_port, self.identity, tls=True, ca_file=self.cert)
        self.assertTrue(wait_for(lambda: self.agent.status()["connected"]))

        async def phone():
            context = ssl.create_default_context(cafile=self.cert)
            reader, writer = await asyncio.open_connection("127.0.0.1", self.relay_port, ssl=context)
            writer.write(f"PHONE {self.identity.office} {self.identity.phone_key}\n".encode())
            await writer.drain()
            assert (await asyncio.wait_for(reader.readline(), 5)).strip() == b"READY"
            writer.write(b"hi")
            await writer.drain()
            data = await asyncio.wait_for(reader.readexactly(7), 5)
            writer.close()
            return data
        self.assertEqual(self.run_async(phone(), 15), b"echo:hi")

    def test_a_relay_whose_certificate_is_not_trusted_is_refused_and_nothing_is_sent(self):
        self.agent.start("127.0.0.1", self.relay_port, self.listener_port, self.identity, tls=True)  # system trust: knows nothing of it
        self.assertTrue(wait_for(lambda: bool(self.agent.status()["error"]), 5), self.agent.status())
        self.assertIn("certificate", self.agent.status()["error"].lower())
        self.assertFalse(self.agent.status()["connected"])
        self.assertEqual(self.relay.offices, {})  # the PC's secret never reached it


class AgentTests(AgentCase):
    def test_a_phone_through_the_relay_reaches_the_listener_and_the_answer_comes_back(self):
        self.start_agent()
        self.assertEqual(self.run_async(self.phone_says(b"hello"), 10), b"echo:hello")

    def test_several_phones_one_after_another_all_get_through(self):
        self.start_agent()
        for i in range(4):
            self.assertEqual(self.run_async(self.phone_says(f"n{i}".encode()), 10), f"echo:n{i}".encode())

    def test_a_phone_with_the_wrong_key_gets_nothing_through(self):
        self.start_agent()
        self.assertEqual(self.run_async(self.phone_says(b"x", key="d" * 64), 10), "OFFLINE")

    def test_the_status_says_connected_then_not_after_stopping(self):
        self.start_agent()
        self.assertIsNone(self.agent.status()["error"])
        self.agent.stop()
        self.assertFalse(self.agent.status()["connected"])
        self.assertEqual(self.run_async(self.phone_says(b"x"), 10), "OFFLINE")

    def test_it_connects_again_by_itself_after_the_relay_drops_it(self):
        self.start_agent()
        self.run_async(self.relay.close())  # kicks every connection, as a relay restart would
        self.assertTrue(wait_for(lambda: not self.agent.status()["connected"], 5))
        self.assertTrue(wait_for(lambda: self.agent.status()["connected"], 15), self.agent.status())
        self.assertEqual(self.run_async(self.phone_says(b"back"), 10), b"echo:back")

    def test_when_the_listener_is_down_the_phone_is_cut_off_instead_of_hanging(self):
        self.start_agent()
        self.listener.close()
        self.run_async(self.listener.wait_closed())
        result = self.run_async(self.phone_says(b"x", wait=5), 15)
        self.assertNotEqual(result, b"echo:x")

    def test_a_relay_that_refuses_the_pc_is_reported_with_a_reason(self):
        other = relay_agent.load_identity(tempfile.mkdtemp())
        other.office = self.identity.office  # same office, different secret: someone else's
        first = relay_agent.RelayAgent()
        first.start("127.0.0.1", self.relay_port, self.listener_port, other)
        self.assertTrue(wait_for(lambda: first.status()["connected"]))
        try:
            self.agent.start("127.0.0.1", self.relay_port, self.listener_port, self.identity)
            self.assertTrue(wait_for(lambda: bool(self.agent.status()["error"]), 5), self.agent.status())
            self.assertFalse(self.agent.status()["connected"])
            self.assertIn("refused", self.agent.status()["error"].lower())
        finally:
            first.stop()

    def test_an_unreachable_relay_is_reported_not_raised(self):
        self.agent.start("127.0.0.1", 1, self.listener_port, self.identity)
        self.assertTrue(wait_for(lambda: bool(self.agent.status()["error"]), 5))
        self.assertFalse(self.agent.status()["connected"])


if __name__ == "__main__":
    unittest.main()
