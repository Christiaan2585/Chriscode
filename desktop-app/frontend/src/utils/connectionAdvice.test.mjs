import test from "node:test";
import assert from "node:assert/strict";
import { connectionAdvice } from "./connectionAdvice.js";

const ok = (host, ms = 40) => ({ host, ok: true, ms });
const bad = (host, problem = "no answer") => ({ host, ok: false, problem, ms: 3500 });

test("connected on the office Wi-Fi, with a tip about connecting from anywhere", () => {
  const a = connectionAdvice({ results: [ok("192.168.1.20")], phoneAddresses: ["192.168.1.55"] });
  assert.equal(a.level, "good");
  assert.match(a.headline, /192\.168\.1\.20/);
  assert.match(a.tips.join(" "), /Connect from anywhere/);
});

test("connected through Tailscale needs no tips", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20"), ok("100.88.1.2", 120)], phoneAddresses: ["10.20.30.4"] });
  assert.equal(a.level, "good");
  assert.match(a.headline, /Tailscale/);
  assert.deepEqual(a.tips, []);
});

test("one address works and another does not: the working one is used, the dead one is mentioned", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20"), ok("192.168.1.31")], phoneAddresses: ["192.168.1.55"] });
  assert.equal(a.level, "good");
  assert.match(a.tips.join(" "), /192\.168\.1\.20/);
});

test("not on Wi-Fi at all", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20")], phoneAddresses: [] });
  assert.equal(a.level, "bad");
  assert.match(a.headline, /Wi-Fi/);
});

test("on a different network from the PC", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20")], phoneAddresses: ["10.0.0.7"] });
  assert.equal(a.level, "bad");
  assert.match(a.headline, /different network/i);
  assert.match(a.tips.join(" "), /Connect from anywhere/);
});

test("same network but no answer: the PC app, sleep and Wi-Fi isolation are the suspects", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20")], phoneAddresses: ["192.168.1.55"] });
  assert.equal(a.level, "bad");
  const text = a.tips.join(" ");
  assert.match(text, /running/);
  assert.match(text, /asleep|sleep/);
  assert.match(text, /isolation|different Wi-Fi point/i);
});

test("something answering that is not the PC is flagged", () => {
  const a = connectionAdvice({ results: [{ host: "192.168.1.20", ok: false, problem: "something answers, but it is not the office PC", ms: 90 }], phoneAddresses: ["192.168.1.55"] });
  assert.match(a.tips.join(" "), /not the office PC|another device|re-pair/i);
});

test("nothing known at all", () => {
  assert.equal(connectionAdvice({ results: [], phoneAddresses: ["192.168.1.55"] }).level, "bad");
});

test("Tailscale is on for the phone but no address of the PC is known on it: finish the PC side", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20")], phoneAddresses: ["192.168.1.55"], tailnetPhoneAddresses: ["100.70.1.1"] });
  assert.equal(a.level, "bad");
  assert.match(a.tips.join(" "), /Tailscale on the PC|PC.*Tailscale/);
});

test("the PC's Tailscale address is known but Tailscale is off on the phone", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20"), bad("100.88.1.2")], phoneAddresses: [], tailnetPhoneAddresses: [] });
  assert.match(a.headline + a.tips.join(" "), /Tailscale/);
  assert.match(a.tips.join(" "), /turn.*on|open Tailscale/i);
});

const relayRow = (over = {}) => ({ host: "relay.example.com", via: "relay", ok: true, ms: 180, ...over });

test("only the relay works: connected through the internet, and that is a good thing", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20"), relayRow()], phoneAddresses: [] });
  assert.equal(a.level, "good");
  assert.match(a.headline, /relay|internet/i);
  assert.match(a.headline, /180 ms/);
});

test("the Wi-Fi works and the relay is there as a spare", () => {
  const a = connectionAdvice({ results: [ok("192.168.1.20"), relayRow()], phoneAddresses: ["192.168.1.55"] });
  assert.equal(a.level, "good");
  assert.match(a.headline, /192\.168\.1\.20/);
});

test("the relay is reachable but the office PC is not connected to it", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20"), relayRow({ ok: false, problem: "the office PC is not connected to the relay" })], phoneAddresses: ["192.168.1.55"] });
  assert.equal(a.level, "bad");
  assert.match(a.tips.join(" "), /running on the (office )?PC/i);
});

test("this phone cannot reach the relay at all", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20"), relayRow({ ok: false, problem: "the relay cannot be reached" })], phoneAddresses: ["192.168.1.55"] });
  assert.match(a.tips.join(" "), /internet/i);
});

test("no relay is set up: the tip says who can switch it on", () => {
  const a = connectionAdvice({ results: [bad("192.168.1.20")], phoneAddresses: ["192.168.1.55"], hasRelay: false });
  assert.match(a.tips.join(" "), /Connect from anywhere/);
});
