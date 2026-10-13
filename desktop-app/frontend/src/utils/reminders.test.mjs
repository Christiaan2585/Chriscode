import test from "node:test";
import assert from "node:assert/strict";
import { reminderFor } from "./reminders.js";

const item = (type, severity, title) => ({ type, severity, title, detail: "d" });
const TODAY = "2026-10-13";

test("nothing to say when nothing is overdue or due soon", () => {
  assert.equal(reminderFor([item("treatment", "info", "Later"), item("client_info", "overdue", "Phone missing")], TODAY, null), null);
});

test("overdue and soon treatments, scans and unpaid invoices make one summary", () => {
  const r = reminderFor([item("treatment", "overdue", "Dosing"), item("invoice_overdue", "overdue", "INV1"), item("scan", "soon", "Scan"), item("quote_followup", "soon", "Q1")], TODAY, null);
  assert.equal(r.count, 3);
  assert.match(r.title, /3 things/);
  assert.match(r.body, /Dosing/);
});

test("one item is worded in the singular", () => {
  const r = reminderFor([item("invoice_overdue", "overdue", "INV1")], TODAY, null);
  assert.match(r.title, /1 thing /);
});

test("only once a day", () => {
  const items = [item("treatment", "overdue", "Dosing")];
  assert.equal(reminderFor(items, TODAY, TODAY), null);
  assert.ok(reminderFor(items, TODAY, "2026-10-12"));
});

test("the body lists at most three titles", () => {
  const items = ["A", "B", "C", "D", "E"].map((t) => item("treatment", "overdue", t));
  const r = reminderFor(items, TODAY, null);
  assert.match(r.body, /A.*B.*C/);
  assert.doesNotMatch(r.body, /D/);
  assert.match(r.body, /2 more/);
});
