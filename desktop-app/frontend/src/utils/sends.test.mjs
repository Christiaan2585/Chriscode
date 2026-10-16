import test from "node:test";
import assert from "node:assert/strict";
import { describeSend, sendKindOf } from "./sends.js";

const entry = { via: "email", at: "2026-10-16T08:30:00", to: "piet@example.com", by: "Sarah" };

test("a send is described short for the list and long for the tooltip", () => {
  const d = describeSend(entry);
  assert.equal(d.short, "Sent by email · 16 Oct");
  assert.equal(d.long, "Sent by email to piet@example.com on 16 October 2026 by Sarah");
});

test("WhatsApp and send-from-app read naturally", () => {
  assert.equal(describeSend({ via: "whatsapp", at: "2026-10-16T08:30:00" }).short, "Sent on WhatsApp · 16 Oct");
  assert.equal(describeSend({ via: "app-email", at: "2026-10-16T08:30:00", to: "a@b.co" }).short, "Sent by email · 16 Oct");
});

test("a reminder says reminder", () => {
  assert.equal(describeSend(entry, "reminder").short, "Reminder sent by email · 16 Oct");
});

test("no send, no description", () => {
  assert.equal(describeSend(undefined), null);
});

test("which kind of send a preview is recorded as", () => {
  assert.equal(sendKindOf({ kind: "quote" }), "quote");
  assert.equal(sendKindOf({ kind: "invoice" }), "invoice");
  assert.equal(sendKindOf({ kind: "invoice", send: { sendKind: "reminder" } }), "reminder");
  assert.equal(sendKindOf({ kind: "catalogue" }), "order-form");
  assert.equal(sendKindOf({ kind: "program-costs" }), "program-costs");
  assert.equal(sendKindOf({ kind: "statement" }), "statement");
  assert.equal(sendKindOf({ kind: "tax-certificate" }), null);
  assert.equal(sendKindOf({ kind: "purchase-order" }), null);
});

test("in Afrikaans the sent note is Afrikaans", () => {
  const d = describeSend(entry, "", "af");
  assert.match(d.short, /^Gestuur per e-pos · 16 /);
  assert.match(d.long, /^Gestuur per e-pos aan piet@example.com op 16 Oktober 2026 deur Sarah$/);
  assert.match(describeSend({ via: "whatsapp", at: "2026-10-16T08:30:00" }, "", "af").short, /^Gestuur per WhatsApp · /);
  assert.match(describeSend(entry, "reminder", "af").short, /^Herinnering gestuur per e-pos/);
});
