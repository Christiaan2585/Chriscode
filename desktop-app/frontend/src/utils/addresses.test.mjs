import test from "node:test";
import assert from "node:assert/strict";
import { addressKind, isTailnetAddress } from "./addresses.js";

test("Tailscale's range is 100.64.0.0 to 100.127.255.255", () => {
  assert.equal(isTailnetAddress("100.64.0.1"), true);
  assert.equal(isTailnetAddress("100.101.102.103"), true);
  assert.equal(isTailnetAddress("100.127.255.254"), true);
  assert.equal(isTailnetAddress("100.63.0.1"), false);
  assert.equal(isTailnetAddress("100.128.0.1"), false);
  assert.equal(isTailnetAddress("192.168.1.20"), false);
  assert.equal(isTailnetAddress("not an address"), false);
});

test("an address is described by what it is", () => {
  assert.equal(addressKind("192.168.1.20"), "wifi");
  assert.equal(addressKind("10.0.0.5"), "wifi");
  assert.equal(addressKind("172.20.1.1"), "wifi");
  assert.equal(addressKind("100.90.1.2"), "tailscale");
  assert.equal(addressKind("office-pc.local"), "name");
  assert.equal(addressKind("127.0.0.1"), "this phone");
  assert.equal(addressKind("8.8.8.8"), "other");
});

import { acceptableAddresses, isOfficeAddress, tailscaleAdvice } from "./addresses.js";

test("only office network addresses are accepted for pairing and for what the PC reports", () => {
  assert.equal(isOfficeAddress("192.168.1.20", 8443), true);
  assert.equal(isOfficeAddress("100.90.1.2", 8443), true);   // Tailscale
  assert.equal(isOfficeAddress("office-pc.local", 8443), true);
  assert.equal(isOfficeAddress("8.8.8.8", 8443), false);
  assert.equal(isOfficeAddress("evil.example.com", 8443), false);
  assert.equal(isOfficeAddress("192.168.1.20@evil.com", 8443), false);
  assert.equal(isOfficeAddress("192.168.1.20", 99999), false);
});

test("addresses the PC reports are filtered, tidied and de-duplicated, never trusted blindly", () => {
  assert.deepEqual(acceptableAddresses([" 100.90.1.2 ", "192.168.1.20", "192.168.1.20", "8.8.8.8", "bad", 7, null, "x@y"], 8443), ["100.90.1.2", "192.168.1.20"]);
  assert.deepEqual(acceptableAddresses("not a list", 8443), []);
  assert.equal(acceptableAddresses(Array.from({ length: 50 }, (_, i) => `10.0.0.${i + 1}`), 8443).length, 8);
});

test("the PC's Tailscale status becomes one plain sentence and a next step", () => {
  assert.equal(tailscaleAdvice({ installed: true, address: "100.90.1.2" }).level, "good");
  assert.match(tailscaleAdvice({ installed: true, address: null }).text, /sign in|connect/i);
  const missing = tailscaleAdvice({ installed: false, address: null });
  assert.equal(missing.level, "todo");
  assert.match(missing.text, /Install Tailscale/);
  assert.match(missing.link, /^https:\/\/tailscale\.com\//);
  assert.equal(tailscaleAdvice(undefined).level, "todo");
});

import { acceptableRelay } from "./addresses.js";

const GOOD_RELAY = { host: "relay.example.com", port: 8447, office: "a".repeat(32), key: "b".repeat(64) };

test("relay details from the PC are only kept when every part is well formed", () => {
  assert.deepEqual(acceptableRelay(GOOD_RELAY), GOOD_RELAY);
  assert.deepEqual(acceptableRelay({ ...GOOD_RELAY, host: " Relay.Example.com " }), GOOD_RELAY);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, host: "bad host" }), null);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, host: "http://relay.example.com" }), null);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, host: "relay.example.com:1" }), null);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, host: "a@b.com" }), null);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, port: 0 }), null);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, port: 70000 }), null);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, office: "short" }), null);
  assert.equal(acceptableRelay({ ...GOOD_RELAY, key: "Z".repeat(64) }), null);
  assert.equal(acceptableRelay(null), null);
  assert.equal(acceptableRelay("relay"), null);
});
