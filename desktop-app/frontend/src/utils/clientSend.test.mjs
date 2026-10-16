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

// --- Language: a client set to Afrikaans gets Afrikaans, anyone else English ---
const piet = { name: "Piet", phone: "0821234567", email: "p@x.co" };
const pietAf = { ...piet, language: "af" };

test("languageOf: only 'af' is Afrikaans", () => {
  assert.equal(mod.languageOf(pietAf), "af");
  assert.equal(mod.languageOf({ language: "en" }), "en");
  assert.equal(mod.languageOf({}), "en");
  assert.equal(mod.languageOf(undefined), "en");
});

test("an Afrikaans client's quote, invoice and programs are written in Afrikaans", () => {
  const q = mod.quoteDoc({ id: 1, number: "QUO0000007" }, pietAf);
  assert.equal(q.send.subject, "U kwotasie QUO0000007");
  assert.match(q.send.message, /^Goeie dag Piet, hier is u kwotasie \(QUO0000007\) aangeheg/);
  const inv = mod.invoiceDoc({ id: 2, number: "INV0000182" }, pietAf);
  assert.equal(inv.send.subject, "U faktuur INV0000182");
  assert.match(inv.send.message, /hier is u faktuur \(INV0000182\) aangeheg/);
  assert.equal(mod.programSend(pietAf, false).subject, "U kuddeprogram");
  assert.match(mod.programSend(pietAf, true).message, /kuddeprogram se koste/);
});

test("English stays the default and is unchanged", () => {
  assert.equal(mod.quoteDoc({ id: 1, number: "QUO1" }, piet).send.subject, "Your quote QUO1");
  assert.match(mod.programSend(piet, false).message, /^Good day Piet, please find your herding program attached/);
});

test("statementMessage speaks the client's language", () => {
  assert.match(mod.statementMessage(piet).message, /statement of account attached/);
  assert.equal(mod.statementMessage(pietAf).subject, "U rekeningstaat");
});

// --- Payment reminder for an overdue invoice ---
test("a payment reminder names the invoice, the amount and the due date, in the client's language", () => {
  const due = "2026-09-30T00:00:00";
  const en = mod.reminderDoc({ id: 5, number: "INV0000150" }, piet, { amountText: "R 1,200.00", dueDate: due });
  assert.equal(en.kind, "invoice");
  assert.equal(en.send.subject, "Payment reminder - invoice INV0000150");
  assert.match(en.send.message, /INV0000150 for R 1,200\.00 was due on 30 September 2026/);
  assert.match(en.send.message, /already paid/);
  const af = mod.reminderDoc({ id: 5, number: "INV0000150" }, pietAf, { amountText: "R 1,200.00", dueDate: due });
  assert.equal(af.send.subject, "Betalingsherinnering - faktuur INV0000150");
  assert.match(af.send.message, /faktuur INV0000150 vir R 1,200\.00 op 30 September 2026 verskuldig was/);
});

test("a reminder with no due date still reads properly", () => {
  const doc = mod.reminderDoc({ id: 5, number: "INV1" }, piet, { amountText: "R 10.00" });
  assert.match(doc.send.message, /invoice INV1 for R 10\.00 is overdue/);
});

// --- Treatment reminder: the farm's coming program dates ---
test("a treatment reminder lists each date with what happens", () => {
  const items = [{ date: "2026-10-24T00:00:00", label: "First vaccination" }, { date: "2026-11-02T00:00:00", label: "Dosing" }];
  const en = mod.treatmentMessage(piet, items);
  assert.match(en.message, /^Good day Piet, a reminder of your coming herding program dates:/);
  assert.match(en.message, /- 24 October: First vaccination/);
  assert.match(en.message, /- 2 November: Dosing/);
  assert.equal(en.subject, "Your herding program dates");
  const af = mod.treatmentMessage(pietAf, items);
  assert.match(af.message, /herinnering van u kuddeprogram se komende datums/);
  assert.match(af.message, /- 24 Oktober: First vaccination/);
  assert.equal(af.subject, "U kuddeprogram se datums");
});

test("with nothing coming up there is no message to send", () => {
  assert.equal(mod.treatmentMessage(piet, []), null);
});

// --- The business can change the wording (Settings -> Messages to clients) ---
test("a business's own wording replaces the standard one, with placeholders filled in", () => {
  mod.setMessageTemplates({ en: { quote: { subject: "Quote {number} for {name}", body: "Hi {name}, quote {number} is attached. Regards" } } });
  try {
    const q = mod.quoteDoc({ id: 1, number: "QUO0000007" }, piet);
    assert.equal(q.send.subject, "Quote QUO0000007 for Piet");
    assert.equal(q.send.message, "Hi Piet, quote QUO0000007 is attached. Regards");
    assert.equal(mod.invoiceDoc({ id: 2, number: "INV1" }, piet).send.subject, "Your invoice INV1"); // not overridden
    assert.equal(mod.quoteDoc({ id: 1, number: "QUO1" }, pietAf).send.subject, "U kwotasie QUO1"); // other language untouched
  } finally {
    mod.setMessageTemplates({});
  }
});

test("one field can be overridden and the other stays standard", () => {
  mod.setMessageTemplates({ af: { reminder: { body: "Hallo {name}, faktuur {number} vir {amount} is agterstallig." } } });
  try {
    const d = mod.reminderDoc({ id: 5, number: "INV9" }, pietAf, { amountText: "R 10,00", dueDate: "2026-09-30T00:00:00" });
    assert.equal(d.send.subject, "Betalingsherinnering - faktuur INV9");
    assert.equal(d.send.message, "Hallo Piet, faktuur INV9 vir R 10,00 is agterstallig.");
  } finally {
    mod.setMessageTemplates({});
  }
});

test("fill: known placeholders are replaced, unknown ones stay, empty brackets vanish", () => {
  assert.equal(mod.fill("Hi {name}, {number} {unknown}", { name: "Piet", number: "Q1" }), "Hi Piet, Q1 {unknown}");
  assert.equal(mod.fill("Quote ({number}) for {name}", { name: "Piet", number: "" }), "Quote for Piet");
});

test("the standard wording is available for the editor, in both languages and for every message", () => {
  for (const lang of ["en", "af"]) {
    for (const kind of ["quote", "invoice", "reminder", "statement", "program", "costs", "treatments"]) {
      assert.ok(mod.DEFAULTS[lang][kind].subject && mod.DEFAULTS[lang][kind].body, `${lang}/${kind}`);
    }
  }
});

test("a preview shows a message with sample values", () => {
  const p = mod.previewMessage("quote", "en", {});
  assert.match(p.subject, /^Your quote QUO/);
  assert.match(p.message, /Good day /);
  assert.match(mod.previewMessage("treatments", "af", {}).message, /\n- /);
});
