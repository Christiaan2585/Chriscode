"""Settings -> Phones -> "Connect from anywhere": the relay address and switch, the key phones need, and what a phone is
told about it (in the pairing QR code, and later over the connection it already has)."""
import json
import base64
import tempfile
import unittest
from unittest import mock

from fastapi import HTTPException

from app.api import devices
from app.core import lan, relay_agent


class RelaySettingsCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        for target in (mock.patch.object(lan, "default_dir", return_value=self.dir),
                       mock.patch.object(devices, "RELAY", mock.Mock(spec=relay_agent.RelayAgent)),
                       mock.patch.object(devices, "SERVER", mock.Mock(running=True, error=None))):
            target.start()
            self.addCleanup(target.stop)
        devices.RELAY.status.return_value = {"connected": True, "error": None}
        lan.save_settings(self.dir, {"enabled": True, "port": 8443})

    def set_relay(self, enabled=True, address="relay.example.com:8447"):
        return devices.update_relay(devices.RelayUpdate(enabled=enabled, address=address))


class StorageTests(RelaySettingsCase):
    def test_off_until_it_is_switched_on(self):
        self.assertEqual(relay_agent.load_relay_settings(self.dir), {"enabled": False, "host": None, "port": 8447})

    def test_what_is_saved_is_what_comes_back(self):
        relay_agent.save_relay_settings(self.dir, True, "relay.example.com", 443)
        self.assertEqual(relay_agent.load_relay_settings(self.dir), {"enabled": True, "host": "relay.example.com", "port": 443})

    def test_a_damaged_file_means_off_not_a_crash(self):
        with open(relay_agent.settings_file(self.dir), "w") as f:
            f.write("{not json")
        self.assertFalse(relay_agent.load_relay_settings(self.dir)["enabled"])


class UpdateTests(RelaySettingsCase):
    def test_switching_on_saves_and_starts_the_agent_with_this_pcs_identity(self):
        status = self.set_relay()
        self.assertEqual((status["enabled"], status["host"], status["port"]), (True, "relay.example.com", 8447))
        self.assertTrue(status["connected"])
        args = devices.RELAY.start.call_args[0]
        self.assertEqual(args[:3], ("relay.example.com", 8447, 8443))
        self.assertEqual(args[3].office, relay_agent.load_identity(self.dir).office)

    def test_switching_off_stops_it(self):
        self.set_relay()
        self.set_relay(enabled=False, address=None)
        devices.RELAY.stop.assert_called()

    def test_a_bad_address_is_refused_with_the_reason(self):
        with self.assertRaises(HTTPException) as ctx:
            self.set_relay(address="http://relay.example.com")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertFalse(relay_agent.load_relay_settings(self.dir)["enabled"])

    def test_it_cannot_be_switched_on_without_an_address(self):
        with self.assertRaises(HTTPException) as ctx:
            self.set_relay(address=None)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_it_only_runs_while_phones_are_allowed(self):
        devices.SERVER.running = False
        self.set_relay()
        devices.RELAY.start.assert_not_called()

    def test_the_status_is_part_of_the_phone_settings(self):
        with mock.patch.object(devices.lan, "local_addresses", return_value=["192.168.1.5"]):
            self.set_relay()
            self.assertEqual(devices.lan_status()["relay"]["host"], "relay.example.com")

    def test_a_new_key_replaces_the_old_one_and_the_agent_registers_it(self):
        self.set_relay()
        before = relay_agent.load_identity(self.dir).phone_key
        devices.new_relay_key()
        after = relay_agent.load_identity(self.dir).phone_key
        self.assertNotEqual(before, after)
        self.assertEqual(devices.RELAY.start.call_args[0][3].phone_key, after)

    def test_every_relay_setting_is_for_an_admin_on_the_pc(self):
        from app.core.security import require_admin
        for route in devices.router.routes:
            if route.path.startswith("/devices/relay"):
                deps = [d.dependency for d in route.dependencies]
                self.assertIn(require_admin, deps, route.path)
                self.assertIn(devices.require_local, deps, route.path)


class PhoneFacingTests(RelaySettingsCase):
    def test_nothing_about_the_relay_is_given_out_while_it_is_off(self):
        self.assertIsNone(devices.relay_payload())

    def test_the_pairing_qr_carries_what_a_phone_needs_to_use_the_relay(self):
        self.set_relay()
        identity = relay_agent.load_identity(self.dir)
        self.assertEqual(devices.relay_payload(), {"host": "relay.example.com", "port": 8447, "office": identity.office, "key": identity.phone_key})

    def test_the_pairing_code_includes_it(self):
        self.set_relay()
        with mock.patch.object(devices, "lan_status", return_value={"running": True, "addresses": ["192.168.1.5"], "port": 8443,
                                                                  "fingerprint": "ab" * 32}):
            qr = devices.new_pairing_code()["qr"]
        payload = json.loads(base64.urlsafe_b64decode(qr.split("d=")[1] + "=="))
        self.assertEqual(payload["relay"]["host"], "relay.example.com")
        self.assertEqual(len(payload["relay"]["key"]), 64)

    def test_a_connected_phone_is_told_it_too_so_existing_phones_pick_it_up(self):
        self.set_relay()
        self.assertEqual(devices.current_addresses()["relay"]["office"], relay_agent.load_identity(self.dir).office)
        self.set_relay(enabled=False, address=None)
        self.assertIsNone(devices.current_addresses()["relay"])


if __name__ == "__main__":
    unittest.main()
