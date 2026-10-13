"""The connection relay: an office PC keeps an outbound control connection open; a phone arriving at the relay is
joined to a fresh connection the PC opens back, and the bytes are passed through untouched (they are TLS between the
phone and the PC, so the relay can't read them). Tests run the real server on a local port with a fake PC and phone."""
import asyncio
import hashlib
import unittest

from relay.server import RelayServer

OFFICE = "a" * 32
PC_SECRET = "b" * 64
PHONE_KEY = "c" * 64
KEY_HASH = hashlib.sha256(PHONE_KEY.encode()).hexdigest()


async def line(reader, timeout=3):
    return (await asyncio.wait_for(reader.readline(), timeout)).decode().strip()


class RelayCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.relay = RelayServer(pending_timeout=1.0, handshake_timeout=1.0, rate_limit=1000)
        self.server = await asyncio.start_server(self.relay.handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]
        self.opened = []

    async def asyncTearDown(self):
        for writer in self.opened:
            writer.close()
        self.server.close()
        await self.server.wait_closed()
        await self.relay.close()

    async def connect(self):
        reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
        self.opened.append(writer)
        return reader, writer

    async def register_pc(self, office=OFFICE, secret=PC_SECRET, key_hash=KEY_HASH):
        reader, writer = await self.connect()
        writer.write(f"PC {office} {secret} {key_hash}\n".encode())
        await writer.drain()
        return reader, writer, await line(reader)

    async def phone(self, office=OFFICE, key=PHONE_KEY):
        reader, writer = await self.connect()
        writer.write(f"PHONE {office} {key}\n".encode())
        await writer.drain()
        return reader, writer

    async def answer_with_data(self, control_reader, secret=PC_SECRET, office=OFFICE):
        """The PC's side of one phone arriving: read OPEN <id>, open the data connection back."""
        said = await line(control_reader)
        self.assertTrue(said.startswith("OPEN "), said)
        session = said.split()[1]
        reader, writer = await self.connect()
        writer.write(f"DATA {office} {secret} {session}\n".encode())
        await writer.drain()
        return reader, writer


class TunnelTests(RelayCase):
    async def test_a_phone_is_joined_to_the_pc_and_bytes_pass_both_ways_untouched(self):
        control, _, ok = await self.register_pc()
        self.assertEqual(ok, "OK")
        phone_r, phone_w = await self.phone()
        pc_r, pc_w = await self.answer_with_data(control)
        self.assertEqual(await line(phone_r), "READY")
        blob = bytes(range(256)) * 40  # binary, like TLS
        phone_w.write(blob)
        await phone_w.drain()
        self.assertEqual(await asyncio.wait_for(pc_r.readexactly(len(blob)), 3), blob)
        pc_w.write(b"\x16\x03\x03 reply")
        await pc_w.drain()
        self.assertEqual(await asyncio.wait_for(phone_r.readexactly(9), 3), b"\x16\x03\x03 reply")

    async def test_two_phones_at_once_each_get_their_own_tunnel(self):
        control, _, _ = await self.register_pc()
        a_r, a_w = await self.phone()
        b_r, b_w = await self.phone()
        pc_a_r, pc_a_w = await self.answer_with_data(control)
        pc_b_r, pc_b_w = await self.answer_with_data(control)
        self.assertEqual(await line(a_r), "READY")
        self.assertEqual(await line(b_r), "READY")
        a_w.write(b"from-a")
        b_w.write(b"from-b")
        await a_w.drain()
        await b_w.drain()
        got = {await asyncio.wait_for(pc_a_r.readexactly(6), 3), await asyncio.wait_for(pc_b_r.readexactly(6), 3)}
        self.assertEqual(got, {b"from-a", b"from-b"})

    async def test_when_the_phone_hangs_up_the_pc_side_is_closed_too(self):
        control, _, _ = await self.register_pc()
        phone_r, phone_w = await self.phone()
        pc_r, _ = await self.answer_with_data(control)
        await line(phone_r)
        phone_w.close()
        self.assertEqual(await asyncio.wait_for(pc_r.read(10), 3), b"")


class RefusalTests(RelayCase):
    async def test_the_pc_not_being_connected_is_said_plainly(self):
        reader, _ = await self.phone()
        self.assertEqual(await line(reader), "OFFLINE")

    async def test_a_wrong_phone_key_and_an_unknown_office_get_the_same_answer(self):
        await self.register_pc()
        wrong_key, _ = await self.phone(key="d" * 64)
        unknown, _ = await self.phone(office="e" * 32)
        self.assertEqual(await line(wrong_key), "OFFLINE")
        self.assertEqual(await line(unknown), "OFFLINE")

    async def test_nobody_else_can_take_over_an_office_but_the_owner_can_reconnect(self):
        await self.register_pc()
        _, _, thief = await self.register_pc(secret="9" * 64)
        self.assertEqual(thief, "DENIED")
        _, _, owner = await self.register_pc()
        self.assertEqual(owner, "OK")

    async def test_a_data_connection_needs_the_pc_secret_and_a_session_that_is_waiting(self):
        control, _, _ = await self.register_pc()
        phone_r, _ = await self.phone()
        said = await line(control)
        session = said.split()[1]
        for office, secret, sid in ((OFFICE, "9" * 64, session), (OFFICE, PC_SECRET, "f" * 32), ("e" * 32, PC_SECRET, session)):
            reader, writer = await self.connect()
            writer.write(f"DATA {office} {secret} {sid}\n".encode())
            await writer.drain()
            self.assertEqual(await line(reader), "DENIED")
        # the real PC can still answer afterwards
        reader, writer = await self.connect()
        writer.write(f"DATA {OFFICE} {PC_SECRET} {session}\n".encode())
        await writer.drain()
        self.assertEqual(await line(phone_r), "READY")

    async def test_a_phone_whose_pc_never_answers_is_told_so_and_not_left_hanging(self):
        await self.register_pc()
        reader, _ = await self.phone()
        self.assertEqual(await line(reader, timeout=3), "TIMEOUT")

    async def test_the_office_goes_offline_when_the_pc_hangs_up(self):
        _, control_w, _ = await self.register_pc()
        control_w.close()
        await asyncio.sleep(0.2)
        reader, _ = await self.phone()
        self.assertEqual(await line(reader), "OFFLINE")

    async def test_garbage_is_dropped_without_hurting_the_server(self):
        for junk in (b"GET / HTTP/1.1\r\n\r\n", b"PHONE nonsense\n", b"PC " + b"x" * 5000 + b"\n", b"\xff\xfe\x00\n", b"DATA a b\n"):
            reader, writer = await self.connect()
            writer.write(junk)
            await writer.drain()
            await asyncio.wait_for(reader.read(100), 3)  # an answer or a close - never a hang
        _, _, ok = await self.register_pc()
        self.assertEqual(ok, "OK")

    async def test_a_silent_connection_is_closed_after_the_handshake_time(self):
        reader, _ = await self.connect()
        self.assertEqual(await asyncio.wait_for(reader.read(10), 3), b"")


class LimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_address_cannot_hammer_the_server(self):
        relay = RelayServer(rate_limit=5, rate_window=60)
        server = await asyncio.start_server(relay.handle, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        answers = []
        for _ in range(8):
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.write(f"PHONE {OFFICE} {PHONE_KEY}\n".encode())
            await writer.drain()
            answers.append((await asyncio.wait_for(reader.readline(), 3)).decode().strip())
            writer.close()
        server.close()
        await server.wait_closed()
        await relay.close()
        self.assertEqual(answers[:5], ["OFFLINE"] * 5)
        self.assertEqual(set(answers[5:]), {"BUSY"})

    async def test_too_many_waiting_phones_for_one_office_are_turned_away(self):
        relay = RelayServer(pending_timeout=5, max_pending=2, rate_limit=1000)
        server = await asyncio.start_server(relay.handle, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        control_r, control_w = await asyncio.open_connection("127.0.0.1", port)
        control_w.write(f"PC {OFFICE} {PC_SECRET} {KEY_HASH}\n".encode())
        await control_w.drain()
        await asyncio.wait_for(control_r.readline(), 3)
        phones = []
        for _ in range(3):
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.write(f"PHONE {OFFICE} {PHONE_KEY}\n".encode())
            await writer.drain()
            phones.append((reader, writer))
        third = (await asyncio.wait_for(phones[2][0].readline(), 3)).decode().strip()
        for _, w in phones + [(control_r, control_w)]:
            w.close()
        server.close()
        await server.wait_closed()
        await relay.close()
        self.assertEqual(third, "BUSY")


if __name__ == "__main__":
    unittest.main()
