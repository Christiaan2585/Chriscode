import test from "node:test";
import assert from "node:assert/strict";
import { sendChecks, hasWarnings } from "./sendChecks.js";

const today = "2026-10-17";
const piet = { email: "p@example.com", phone: "0825551234" };

test("a client with everything and a normal document has nothing to warn about", () => {
  assert.deepEqual(sendChecks({ kind: "quote", client: piet, doc: { total_amount: 100, expiry_date: "2026-11-01" }, via: "email", today }), []);
});

test("email needs an address and WhatsApp needs a number", () => {
  assert.match(sendChecks({ kind: "invoice", client: { phone: "1" }, via: "email", today })[0].text, /no email address/);
  assert.match(sendChecks({ kind: "invoice", client: { email: "a@b.co", phone: " " }, via: "whatsapp", today })[0].text, /no phone number/);
  assert.equal(sendChecks({ kind: "invoice", client: {}, via: "app-email", today }).length, 1);
});

test("an R0 quote or invoice is flagged", () => {
  assert.match(sendChecks({ kind: "quote", client: piet, doc: { total_amount: 0 }, via: "email", today })[0].text, /R0\.00/);
  assert.equal(sendChecks({ kind: "statement", client: piet, doc: { total_amount: 0 }, via: "email", today }).length, 0);
});

test("an expired quote is flagged, one expiring today is not", () => {
  assert.match(sendChecks({ kind: "quote", client: piet, doc: { total_amount: 5, expiry_date: "2026-10-16T00:00:00" }, via: "email", today })[0].text, /expired/);
  assert.deepEqual(sendChecks({ kind: "quote", client: piet, doc: { total_amount: 5, expiry_date: "2026-10-17" }, via: "email", today }), []);
});

test("paid is only information, cancelled is a warning", () => {
  const paid = sendChecks({ kind: "invoice", client: piet, doc: { total_amount: 5, status: "paid" }, via: "email", today });
  assert.equal(hasWarnings(paid), false);
  assert.equal(hasWarnings(sendChecks({ kind: "invoice", client: piet, doc: { total_amount: 5, status: "cancelled" }, via: "email", today })), true);
});
