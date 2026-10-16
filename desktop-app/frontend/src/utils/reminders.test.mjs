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

// --- The weekly summary: once a week, the first time the app is open ---
import { weekKey, weeklySummary } from "./reminders.js";

const board = (over = {}) => ({
  money: { past_due_count: 3, past_due_total: 4200, unpaid_count: 7, unpaid_total: 9100 },
  quotes_waiting: { count: 2, total: 1500, oldest_days: 6 },
  attention: [{ type: "treatment", severity: "soon", title: "Dosing - Piet" }, { type: "scan", severity: "overdue", title: "Scan - Sarie" }, { type: "invoice_overdue", severity: "overdue", title: "INV1" }],
  ...over,
});

test("weekKey is the ISO week, so Monday starts a new one", () => {
  assert.equal(weekKey(new Date("2026-10-16T10:00:00")), "2026-W42"); // a Friday
  assert.equal(weekKey(new Date("2026-10-18T23:00:00")), "2026-W42"); // Sunday is still that week
  assert.equal(weekKey(new Date("2026-10-19T08:00:00")), "2026-W43"); // Monday
  assert.equal(weekKey(new Date("2027-01-01T08:00:00")), "2026-W53"); // belongs to the old year's last week
});

test("the summary counts what is overdue, waiting and coming up", () => {
  const s = weeklySummary(board(), new Date("2026-10-19T08:00:00"), null);
  assert.equal(s.title, "Your week at a glance");
  assert.match(s.body, /3 invoices overdue/);
  assert.match(s.body, /R 4 200/);
  assert.match(s.body, /2 quotes waiting/);
  assert.match(s.body, /2 program dates/);
});

test("it is shown once a week", () => {
  const monday = new Date("2026-10-19T08:00:00");
  assert.equal(weeklySummary(board(), monday, weekKey(monday)), null);
  assert.ok(weeklySummary(board(), monday, "2026-W42"));
});

test("singular and plural read properly", () => {
  const s = weeklySummary(board({ money: { past_due_count: 1, past_due_total: 100, unpaid_count: 1, unpaid_total: 100 }, quotes_waiting: { count: 1, total: 50, oldest_days: 2 }, attention: [{ type: "treatment", severity: "soon", title: "x" }] }), new Date("2026-10-19T08:00:00"), null);
  assert.match(s.body, /1 invoice overdue/);
  assert.match(s.body, /1 quote waiting/);
  assert.match(s.body, /1 program date/);
});

test("a quiet week says nothing", () => {
  const quiet = board({ money: { past_due_count: 0, past_due_total: 0, unpaid_count: 0, unpaid_total: 0 }, quotes_waiting: { count: 0, total: 0, oldest_days: 0 }, attention: [] });
  assert.equal(weeklySummary(quiet, new Date("2026-10-19T08:00:00"), null), null);
});
