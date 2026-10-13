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
