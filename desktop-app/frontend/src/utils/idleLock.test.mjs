// Run with: node --test src/utils/idleLock.test.mjs (from desktop-app/frontend)
import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_LOCK_OPTIONS, DEFAULT_AUTO_LOCK_MINUTES, idleLongEnough, parseAutoLockMinutes } from "./idleLock.js";

const MIN = 60_000;

test("the list runs from 2 to 30 minutes, plus Off", () => {
  const minutes = AUTO_LOCK_OPTIONS.map((o) => o.minutes);
  assert.equal(minutes[0], 0); // Off first, like iOS "Never"
  assert.deepEqual(minutes.slice(1), [2, 3, 5, 10, 15, 20, 25, 30]);
  assert.ok(AUTO_LOCK_OPTIONS.every((o) => typeof o.label === "string" && o.label.length > 0));
});

test("a stored value is only trusted when it is one of the options", () => {
  assert.equal(parseAutoLockMinutes("15"), 15);
  assert.equal(parseAutoLockMinutes("0"), 0);
  assert.equal(parseAutoLockMinutes(null), DEFAULT_AUTO_LOCK_MINUTES);
  assert.equal(parseAutoLockMinutes(""), DEFAULT_AUTO_LOCK_MINUTES);
  assert.equal(parseAutoLockMinutes("abc"), DEFAULT_AUTO_LOCK_MINUTES);
  assert.equal(parseAutoLockMinutes("1"), DEFAULT_AUTO_LOCK_MINUTES); // below the list
  assert.equal(parseAutoLockMinutes("31"), DEFAULT_AUTO_LOCK_MINUTES); // above the list
  assert.equal(parseAutoLockMinutes("7"), DEFAULT_AUTO_LOCK_MINUTES); // not in the list
});

test("the default is on, not off", () => {
  assert.ok(DEFAULT_AUTO_LOCK_MINUTES >= 2);
});

test("idle means no activity for the whole period", () => {
  assert.equal(idleLongEnough(10 * MIN, 0, 10), true); // exactly on the limit
  assert.equal(idleLongEnough(10 * MIN - 1, 0, 10), false);
  assert.equal(idleLongEnough(25 * MIN, 20 * MIN, 5), true);
  assert.equal(idleLongEnough(24 * MIN, 20 * MIN, 5), false);
});

test("Off never locks", () => {
  assert.equal(idleLongEnough(10_000 * MIN, 0, 0), false);
});

test("a clock that went backwards doesn't lock", () => {
  assert.equal(idleLongEnough(5 * MIN, 20 * MIN, 5), false);
});
