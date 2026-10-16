import test from "node:test";
import assert from "node:assert/strict";
import { isOverdue } from "./overdue.js";

const today = new Date("2026-10-16T10:00:00");
const inv = { status: "unpaid", due_date: "2026-10-01T00:00:00" };

test("an unpaid invoice past its due date with money still owing is overdue", () => {
  assert.equal(isOverdue(inv, { balance: 500 }, today), true);
});

test("paid, cancelled, nothing owing or no due date is not overdue", () => {
  assert.equal(isOverdue({ ...inv, status: "paid" }, { balance: 500 }, today), false);
  assert.equal(isOverdue({ ...inv, status: "cancelled" }, { balance: 500 }, today), false);
  assert.equal(isOverdue(inv, { balance: 0 }, today), false);
  assert.equal(isOverdue(inv, undefined, today), false);
  assert.equal(isOverdue({ ...inv, due_date: null }, { balance: 500 }, today), false);
});

test("due today is not overdue yet, due yesterday is", () => {
  assert.equal(isOverdue({ ...inv, due_date: "2026-10-16T00:00:00" }, { balance: 5 }, today), false);
  assert.equal(isOverdue({ ...inv, due_date: "2026-10-15T00:00:00" }, { balance: 5 }, today), true);
});
