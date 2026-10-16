import test from "node:test";
import assert from "node:assert/strict";
import { backupStatus } from "./backupAge.js";

const now = new Date("2026-10-16T12:00:00");
const at = (iso) => ({ created_at: iso });

test("a backup from this morning is fresh and says so", () => {
  const s = backupStatus([at("2026-10-16T09:45:09")], now);
  assert.equal(s.state, "fresh");
  assert.equal(s.text, "Last backup: today 09:45");
});

test("yesterday and a couple of days ago are still fine", () => {
  assert.equal(backupStatus([at("2026-10-15T09:00:00")], now).text, "Last backup: yesterday 09:00");
  assert.equal(backupStatus([at("2026-10-14T09:00:00")], now).state, "fresh");
  assert.equal(backupStatus([at("2026-10-14T09:00:00")], now).text, "Last backup: 2 days ago");
});

test("more than three days without one is stale", () => {
  const s = backupStatus([at("2026-10-11T09:00:00")], now);
  assert.equal(s.state, "stale");
  assert.equal(s.text, "No backup for 5 days");
});

test("no backups at all is its own state", () => {
  assert.equal(backupStatus([], now).state, "none");
  assert.equal(backupStatus(undefined, now).state, "unknown");
});

test("the newest is used even if the list is not sorted", () => {
  assert.equal(backupStatus([at("2026-10-01T09:00:00"), at("2026-10-16T08:00:00")], now).state, "fresh");
});
