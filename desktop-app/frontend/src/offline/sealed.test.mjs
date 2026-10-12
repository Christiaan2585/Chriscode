import assert from "node:assert/strict";
import test from "node:test";
import { createSealer } from "./sealed.js";

const memoryKeys = () => {
  const data = {};
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => { data[k] = v; }, remove: async (k) => { delete data[k]; } };
};

test("a saved answer goes into storage encrypted and comes back as it was", async () => {
  const keys = memoryKeys();
  const sealer = createSealer(keys);
  const entry = { status: 200, data: [{ id: 1, name: "Jan Smit", phone: "082 555 0101" }], savedAt: 123 };
  const sealed = await sealer.seal(entry);
  assert.equal(sealed.v, 1);
  assert.ok(!JSON.stringify(sealed).includes("Jan Smit"), "the stored form must not contain the plain data");
  assert.deepEqual(await sealer.open(sealed), entry);
});

test("the key is made once, kept in the protected store, and reused", async () => {
  const keys = memoryKeys();
  const a = createSealer(keys);
  const sealed = await a.seal({ x: 1 });
  assert.ok(keys.data.offlineDataKey, "key saved in the protected store");
  const b = createSealer(keys); // e.g. after the app restarts
  assert.deepEqual(await b.open(sealed), { x: 1 });
});

test("data saved before encryption, or with a lost key, reads as nothing (it is downloaded again)", async () => {
  const keys = memoryKeys();
  const sealer = createSealer(keys);
  assert.equal(await sealer.open({ status: 200, data: ["plain old entry"] }), null);
  const sealed = await sealer.seal({ x: 1 });
  await keys.remove("offlineDataKey");
  assert.equal(await createSealer(keys).open(sealed), null);
});

test("tampered data is refused rather than trusted", async () => {
  const keys = memoryKeys();
  const sealer = createSealer(keys);
  const sealed = await sealer.seal({ total: 100 });
  const bytes = Buffer.from(sealed.data, "base64");
  bytes[bytes.length - 1] ^= 1;
  assert.equal(await sealer.open({ ...sealed, data: bytes.toString("base64") }), null);
});

test("every save uses a fresh nonce", async () => {
  const sealer = createSealer(memoryKeys());
  const a = await sealer.seal({ same: true });
  const b = await sealer.seal({ same: true });
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test("forgetting the key makes everything already saved unreadable", async () => {
  const keys = memoryKeys();
  const sealer = createSealer(keys);
  const sealed = await sealer.seal({ x: 1 });
  await sealer.forgetKey();
  assert.equal(keys.data.offlineDataKey, undefined);
  assert.equal(await createSealer(keys).open(sealed), null);
});

test("a large answer (several MB, like the product pictures) is sealed and opened intact", async () => {
  const sealer = createSealer(memoryKeys());
  const big = { thumbnails: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i, "data:image/jpeg;base64," + "A".repeat(60000)])) };
  assert.deepEqual(await sealer.open(await sealer.seal(big)), big);
});
