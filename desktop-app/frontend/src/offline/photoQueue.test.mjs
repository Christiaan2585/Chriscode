import test from "node:test";
import assert from "node:assert/strict";
import { createPhotoQueue } from "./photoQueue.js";

const memoryStore = () => {
  let next = 1;
  const rows = new Map();
  return {
    add: async (value) => { rows.set(next, value); return next++; },
    all: async () => [...rows].map(([id, value]) => ({ id, value })),
    remove: async (id) => { rows.delete(id); },
  };
};
// "Sealing" for the test: wrap in a marker so a wrong key can be simulated by returning null from open.
const makeQueue = (open = async (v) => v.inner) => createPhotoQueue({ store: memoryStore(), seal: async (v) => ({ inner: v }), open });
const bytes = (text) => new TextEncoder().encode(text).buffer;
const photo = (clientId, text = "pic") => ({ clientId, caption: "Sick ewe", name: "a.jpg", type: "image/jpeg", bytes: bytes(text) });
const offlineError = () => Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
const refused = (status) => Object.assign(new Error("no"), { response: { status } });

test("a queued photo is counted, per client and in total", async () => {
  const q = makeQueue();
  await q.add(photo(1));
  await q.add(photo(2));
  await q.add(photo(2));
  assert.equal(await q.count(), 3);
  assert.equal(await q.count(2), 2);
});

test("flush uploads each photo in order with its caption and bytes, then forgets it", async () => {
  const q = makeQueue();
  await q.add(photo(7, "first"));
  await q.add(photo(8, "second"));
  const seen = [];
  const out = await q.flush(async ({ clientId, caption, file }) => { seen.push([clientId, caption, file.name, await file.text()]); });
  assert.deepEqual(seen, [[7, "Sick ewe", "a.jpg", "first"], [8, "Sick ewe", "a.jpg", "second"]]);
  assert.deepEqual(out, { sent: 2, dropped: 0, remaining: 0 });
  assert.equal(await q.count(), 0);
});

test("no answer from the PC stops the run and keeps the rest", async () => {
  const q = makeQueue();
  await q.add(photo(1));
  await q.add(photo(2));
  const out = await q.flush(async () => { throw offlineError(); });
  assert.deepEqual(out, { sent: 0, dropped: 0, remaining: 2 });
  assert.equal(await q.count(), 2);
});

test("not being signed in yet (401) is also retried later", async () => {
  const q = makeQueue();
  await q.add(photo(1));
  const out = await q.flush(async () => { throw refused(401); });
  assert.equal(out.remaining, 1);
});

test("a photo the PC refuses for good is dropped and the next one still goes", async () => {
  const q = makeQueue();
  await q.add(photo(1));
  await q.add(photo(2));
  const sent = [];
  const out = await q.flush(async ({ clientId }) => { if (clientId === 1) throw refused(404); sent.push(clientId); });
  assert.deepEqual(out, { sent: 1, dropped: 1, remaining: 0 });
  assert.deepEqual(sent, [2]);
});

test("a photo that can no longer be unsealed is dropped, not retried", async () => {
  const q = makeQueue(async () => null);
  await q.add(photo(1));
  const out = await q.flush(async () => { throw new Error("should not be called"); });
  assert.deepEqual(out, { sent: 0, dropped: 1, remaining: 0 });
});
