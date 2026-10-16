import test from "node:test";
import assert from "node:assert/strict";

import * as mod from "./clientSend.js";

test("quoteDoc carries the client's phone, email and the quote number", () => {
  const doc = mod.quoteDoc({ id: 7, number: "QUO0000007" }, { name: "Piet", phone: "0821234567", email: "p@x.co" });
  assert.equal(doc.kind, "quote");
  assert.equal(doc.send.phone, "0821234567");
  assert.equal(doc.send.email, "p@x.co");
  assert.match(doc.send.subject, /QUO0000007/);
  assert.match(doc.send.message, /Piet/);
});

test("programSend tells costs from the program sheet and survives a missing client", () => {
  assert.match(mod.programSend({ name: "Piet" }, true).subject, /costs/);
  assert.doesNotMatch(mod.programSend({ name: "Piet" }, false).subject, /costs/);
  assert.equal(mod.programSend(undefined, false).phone, undefined);
});

test("invoiceDoc carries the client's contact details and the invoice number", () => {
  const doc = mod.invoiceDoc({ id: 3, number: "INV0000182" }, { name: "Piet", phone: "0821234567", email: "p@x.co" });
  assert.equal(doc.kind, "invoice");
  assert.equal(doc.send.phone, "0821234567");
  assert.match(doc.send.subject, /INV0000182/);
  assert.match(doc.send.message, /invoice \(INV0000182\)/);
});
