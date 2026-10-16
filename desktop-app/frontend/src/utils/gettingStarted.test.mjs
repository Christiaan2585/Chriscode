import test from "node:test";
import assert from "node:assert/strict";
import { buildChecklist } from "./gettingStarted.js";

const fresh = { isAdmin: true, businessMissing: ["Address", "Phone number"], user: {}, mailConfigured: false, counts: { clients: 0, quotes: 0, invoices: 0 }, extraBackup: false };

test("a brand-new business has six things to do, none done", () => {
  const list = buildChecklist(fresh);
  assert.equal(list.total, 6);
  assert.equal(list.doneCount, 0);
  assert.equal(list.complete, false);
  assert.deepEqual(list.steps.map((s) => s.id), ["company", "me", "email", "client", "quote", "backup"]);
});

test("each step ticks off by what has actually been done", () => {
  const list = buildChecklist({ ...fresh, businessMissing: [], user: { phone: "082", avatar_url: "x" }, mailConfigured: true,
    counts: { clients: 3, quotes: 0, invoices: 1 }, extraBackup: true });
  assert.equal(list.complete, true);
  assert.equal(list.doneCount, 6);
});

test("a first quote OR a first invoice is enough", () => {
  assert.equal(buildChecklist({ ...fresh, counts: { clients: 0, quotes: 1, invoices: 0 } }).steps.find((s) => s.id === "quote").done, true);
  assert.equal(buildChecklist({ ...fresh, counts: { clients: 0, quotes: 0, invoices: 2 } }).steps.find((s) => s.id === "quote").done, true);
});

test("a staff member only sees what they can do themselves", () => {
  const list = buildChecklist({ ...fresh, isAdmin: false });
  assert.deepEqual(list.steps.map((s) => s.id), ["me", "client", "quote"]);
});

test("a phone number without a photo is not done", () => {
  assert.equal(buildChecklist({ ...fresh, user: { phone: "082" } }).steps.find((s) => s.id === "me").done, false);
});

test("while the facts are still loading nothing is claimed", () => {
  const list = buildChecklist({ ...fresh, counts: undefined, extraBackup: null });
  assert.equal(list.ready, false);
});
