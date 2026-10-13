import test from "node:test";
import assert from "node:assert/strict";
import { describeMovement, groupByDay, statusLabel } from "./stockTimeline.js";

const row = (over) => ({ id: 1, at: "2026-10-14T09:30:00", product_name: "Dip", change: -3, reason: "sold", reference: "INV0000012", note: null, balance: 7, by: null, ...over });

test("each kind of movement is put in plain words", () => {
  assert.equal(describeMovement(row({})), "Sold on invoice INV0000012");
  assert.equal(describeMovement(row({ reason: "received", reference: "PO0000003", change: 20 })), "Received on purchase order PO0000003");
  assert.equal(describeMovement(row({ reason: "count", reference: null, note: null })), "Counted");
  assert.equal(describeMovement(row({ reason: "count", reference: null, note: "Year-end" })), "Counted - Year-end");
  assert.equal(describeMovement(row({ reason: "adjusted", reference: null, note: "Two spilled" })), "Adjusted - Two spilled");
});

test("a document with no number is still named", () => {
  assert.equal(describeMovement(row({ reference: null })), "Sold on an invoice");
  assert.equal(describeMovement(row({ reason: "received", reference: null, change: 20 })), "Received on a purchase order");
});

test("a sale that was corrected upwards reads as a return to stock", () => {
  assert.equal(describeMovement(row({ change: 2 })), "Sale corrected (invoice INV0000012)");
  assert.equal(describeMovement(row({ reason: "received", change: -5, reference: "PO0000003" })), "Delivery corrected (purchase order PO0000003)");
});

test("movements are grouped by the day they happened, in the order given", () => {
  const groups = groupByDay([row({ id: 3, at: "2026-10-14T15:00:00" }), row({ id: 2, at: "2026-10-14T09:00:00" }), row({ id: 1, at: "2026-10-12T08:00:00" })]);
  assert.deepEqual(groups.map((g) => [g.day, g.rows.map((r) => r.id)]), [["2026-10-14", [3, 2]], ["2026-10-12", [1]]]);
});

test("statuses have labels", () => {
  assert.equal(statusLabel("low"), "Low");
  assert.equal(statusLabel("out"), "Out of stock");
  assert.equal(statusLabel("untracked"), "Not counted yet");
  assert.equal(statusLabel("ok"), "OK");
});
