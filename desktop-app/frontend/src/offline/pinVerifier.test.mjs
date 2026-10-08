import assert from "node:assert/strict";
import test from "node:test";
import { checkPin, makeVerifier } from "./pinVerifier.js";
import { MAX_OFFLINE_FAILURES, saveOfflineLogin, tryOfflineUnlock, offlineLoginExists, touchOfflineLogin, updateOfflineUser } from "./offlineLogin.js";

// A secure store that keeps text in a map, like the phone's Keystore-sealed one.
const memoryStore = () => {
  const map = new Map();
  return { get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v), remove: async (k) => void map.delete(k), map };
};
const FAST = { iterations: 1000 };
const USER = { id: 1, name: "Emu", email: "emu@example.com", is_admin: true, has_pin: true };

test("a PIN verifies only against the PIN it was made from", async () => {
  const verifier = await makeVerifier("24680", FAST);
  assert.equal(await checkPin("24680", verifier), true);
  assert.equal(await checkPin("24681", verifier), false);
  assert.equal(await checkPin("", verifier), false);
});

test("the stored verifier holds no PIN and differs per make (random salt)", async () => {
  const a = await makeVerifier("24680", FAST);
  const b = await makeVerifier("24680", FAST);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.ok(!JSON.stringify(a).includes("24680"));
});

test("offline unlock works with the right PIN and gives back the saved user", async () => {
  const store = memoryStore();
  assert.equal(await offlineLoginExists(store), false);
  await saveOfflineLogin(store, "24680", USER, FAST);
  assert.equal(await offlineLoginExists(store), true);
  const result = await tryOfflineUnlock(store, "24680");
  assert.equal(result.ok, true);
  assert.deepEqual(result.user, USER);
});

test("five wrong tries switch offline unlock off until the next online sign-in", async () => {
  const store = memoryStore();
  await saveOfflineLogin(store, "24680", USER, FAST);
  let last;
  for (let i = 1; i <= MAX_OFFLINE_FAILURES; i += 1) {
    last = await tryOfflineUnlock(store, "00000");
    assert.equal(last.ok, false);
    assert.equal(last.left, MAX_OFFLINE_FAILURES - i);
  }
  assert.equal(last.disabled, true);
  assert.equal(await offlineLoginExists(store), false);
  const after = await tryOfflineUnlock(store, "24680"); // even the right PIN no longer works offline
  assert.deepEqual([after.ok, after.disabled], [false, true]);
});

test("the failure count is kept in the store itself, so closing the app does not reset it", async () => {
  const store = memoryStore();
  await saveOfflineLogin(store, "24680", USER, FAST);
  await tryOfflineUnlock(store, "11111");
  await tryOfflineUnlock(store, "22222");
  assert.match(store.map.get("offlineLogin"), /"failures":2/);
  assert.equal((await tryOfflineUnlock(store, "24680")).ok, true);
  assert.match(store.map.get("offlineLogin"), /"failures":2/); // a right PIN does not forgive the earlier wrong ones
});

test("saving again after an online sign-in resets the count", async () => {
  const store = memoryStore();
  await saveOfflineLogin(store, "24680", USER, FAST);
  await tryOfflineUnlock(store, "11111");
  await saveOfflineLogin(store, "24680", USER, FAST);
  assert.match(store.map.get("offlineLogin"), /"failures":0/);
});

test("guesses made at the same moment cannot get round the five-try limit", async () => {
  const store = memoryStore();
  await saveOfflineLogin(store, "24680", USER, FAST);
  // nine wrong guesses and then the right PIN, all fired at once
  const results = await Promise.all([..."111111111"].map((_, i) => tryOfflineUnlock(store, `0000${i}`)).concat(tryOfflineUnlock(store, "24680")));
  assert.equal(results.some((r) => r.ok), false); // the right PIN came after the fifth miss, so it is refused
  assert.equal(await offlineLoginExists(store), false);
});

test("offline unlock expires: the phone must have checked in with the office PC recently", async () => {
  const store = memoryStore();
  const day = 24 * 60 * 60 * 1000;
  const start = 1_700_000_000_000;
  await saveOfflineLogin(store, "24680", USER, { ...FAST, now: () => start });
  assert.equal((await tryOfflineUnlock(store, "24680", { now: () => start + 6 * day })).ok, true);
  const late = await tryOfflineUnlock(store, "24680", { now: () => start + 8 * day });
  assert.deepEqual([late.ok, late.expired], [false, true]);
  assert.equal(await offlineLoginExists(store), false); // gone until the next online PIN entry
});

test("a check-in with the office PC renews the time", async () => {
  const store = memoryStore();
  const day = 24 * 60 * 60 * 1000;
  const start = 1_700_000_000_000;
  await saveOfflineLogin(store, "24680", USER, { ...FAST, now: () => start });
  await touchOfflineLogin(store, { now: () => start + 6 * day });
  assert.equal((await tryOfflineUnlock(store, "24680", { now: () => start + 12 * day })).ok, true);
});

test("moving the phone's clock back does not buy more time", async () => {
  const store = memoryStore();
  const day = 24 * 60 * 60 * 1000;
  const start = 1_700_000_000_000;
  await saveOfflineLogin(store, "24680", USER, { ...FAST, now: () => start });
  assert.equal((await tryOfflineUnlock(store, "24680", { now: () => start + 6 * day })).ok, true);
  const rolledBack = await tryOfflineUnlock(store, "24680", { now: () => start + 3 * day }); // earlier than the last time it was used
  assert.deepEqual([rolledBack.ok, rolledBack.expired], [false, true]);
  assert.equal(await offlineLoginExists(store), false);
});

test("a small clock correction is not mistaken for tampering", async () => {
  const store = memoryStore();
  const start = 1_700_000_000_000;
  await saveOfflineLogin(store, "24680", USER, { ...FAST, now: () => start });
  assert.equal((await tryOfflineUnlock(store, "24680", { now: () => start + 60_000 })).ok, true);
  assert.equal((await tryOfflineUnlock(store, "24680", { now: () => start + 30_000 })).ok, true); // 30 s back
});

test("a check-in or profile update that lands during a lock-out cannot bring the record back", async () => {
  const store = memoryStore();
  await saveOfflineLogin(store, "24680", USER, FAST);
  const wrong = [..."12345"].map((d) => tryOfflineUnlock(store, `0000${d}`));
  await Promise.all([...wrong, touchOfflineLogin(store), updateOfflineUser(store, { ...USER, name: "Late" })]);
  assert.equal(await offlineLoginExists(store), false);
});
