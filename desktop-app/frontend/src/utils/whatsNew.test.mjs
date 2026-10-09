import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, markSeen, notesToShow, readSeen } from "./whatsNew.js";

const NOTES = [
  { version: "1.0.10", title: "Ten", items: ["a"] },
  { version: "1.0.9", title: "Nine", items: ["b"] },
  { version: "1.0.8", title: "Eight", items: ["c"] },
];
const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, String(v)) };
};

test("versions compare by number, not by text", () => {
  assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
  assert.equal(compareVersions("1.0.9", "1.0.10"), -1);
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
  assert.equal(compareVersions("1.0.8.1", "1.0.8"), 1);
});

test("someone who last saw 1.0.8 is told about 1.0.9 and 1.0.10, newest first", () => {
  assert.deepEqual(notesToShow(NOTES, "1.0.8", "1.0.10", true).map((n) => n.version), ["1.0.10", "1.0.9"]);
});

test("nothing is shown again for a version already seen", () => {
  assert.deepEqual(notesToShow(NOTES, "1.0.10", "1.0.10", true), []);
});

test("a device that was updated from before this feature gets the current version's notes once", () => {
  assert.deepEqual(notesToShow(NOTES, null, "1.0.10", true).map((n) => n.version), ["1.0.10"]);
});

test("a brand-new install is not told what 'changed'", () => {
  assert.deepEqual(notesToShow(NOTES, null, "1.0.10", false), []);
});

test("notes for versions newer than the running one are never shown early", () => {
  assert.deepEqual(notesToShow(NOTES, "1.0.8", "1.0.9", true).map((n) => n.version), ["1.0.9"]);
});

test("a version with no written notes shows nothing", () => {
  assert.deepEqual(notesToShow(NOTES, "1.0.10", "1.0.11", true), []);
});

test("what has been seen is remembered, and broken storage never breaks the app", () => {
  const store = memory();
  assert.equal(readSeen(store), null);
  markSeen("1.0.10", store);
  assert.equal(readSeen(store), "1.0.10");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readSeen(broken), null);
  assert.doesNotThrow(() => markSeen("1.0.10", broken));
});
