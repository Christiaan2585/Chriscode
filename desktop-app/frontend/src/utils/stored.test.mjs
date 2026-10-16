import test from "node:test";
import assert from "node:assert/strict";
import { clearDraft, loadDraft, pushRecent, readStored, saveDraft, writeStored } from "./stored.js";

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

test("a stored value comes back, and the fallback is used when nothing (or something broken) is stored", () => {
  const s = memory();
  assert.deepEqual(readStored("k", { a: 1 }, s), { a: 1 });
  writeStored("k", { search: "piet", sort: "name" }, s);
  assert.deepEqual(readStored("k", {}, s), { search: "piet", sort: "name" });
  s.setItem("bad", "{not json");
  assert.equal(readStored("bad", "fallback", s), "fallback");
});

test("blocked storage never throws", () => {
  assert.equal(readStored("k", 5, broken), 5);
  assert.doesNotThrow(() => writeStored("k", 1, broken));
});

test("recents: newest first, no duplicates, at most max", () => {
  assert.deepEqual(pushRecent(["1", "2", "3"], "2"), ["2", "1", "3"]);
  assert.deepEqual(pushRecent(["1", "2", "3", "4", "5"], "9"), ["9", "1", "2", "3", "4"]);
  assert.deepEqual(pushRecent([], 7), ["7"]);
  assert.deepEqual(pushRecent(["1"], ""), ["1"]);
});

test("a draft is kept, expires and can be cleared", () => {
  const s = memory();
  saveDraft("invoice", { client_id: "3" }, s, 1000);
  assert.deepEqual(loadDraft("invoice", s, 1000 + 60 * 1000), { client_id: "3" });
  assert.equal(loadDraft("invoice", s, 1000 + 8 * 86400000), null); // older than a week
  saveDraft("invoice", { client_id: "4" }, s, 5000);
  clearDraft("invoice", s);
  assert.equal(loadDraft("invoice", s, 6000), null);
});
