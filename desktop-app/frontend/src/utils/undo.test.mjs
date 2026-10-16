import test from "node:test";
import assert from "node:assert/strict";
import { deletedMessage, isRecordDelete, newestN } from "./undo.js";

test("only deleting a whole record counts (not a line, a payment or a note)", () => {
  assert.equal(isRecordDelete("delete", "/clients/12"), true);
  assert.equal(isRecordDelete("DELETE", "/invoices/7"), true);
  assert.equal(isRecordDelete("delete", "/purchase-orders/3"), true);
  assert.equal(isRecordDelete("delete", "/programs/4"), true);
  assert.equal(isRecordDelete("delete", "/invoices/items/9"), false);
  assert.equal(isRecordDelete("delete", "/payments/5"), false);
  assert.equal(isRecordDelete("delete", "/clients/12/tax-certificate"), false);
  assert.equal(isRecordDelete("get", "/clients/12"), false);
  assert.equal(isRecordDelete("delete", "http://127.0.0.1:8000/quotes/2"), true);
  assert.equal(isRecordDelete("delete", "/quotes/2?x=1"), true);
});

test("the newest N items are the ones just deleted", () => {
  const bin = [{ id: 9 }, { id: 8 }, { id: 7 }, { id: 6 }];
  assert.deepEqual(newestN(bin, 2).map((i) => i.id), [9, 8]);
  assert.deepEqual(newestN(bin, 10).length, 4);
  assert.deepEqual(newestN(bin, 0), []);
});

test("the message names one item or counts several", () => {
  assert.equal(deletedMessage([{ label: "Client: Piet" }]), "Deleted Client: Piet");
  assert.equal(deletedMessage([{ label: "a" }, { label: "b" }, { label: "c" }]), "Deleted 3 items");
  assert.equal(deletedMessage([{}]), "Deleted");
});

test("the message follows the app's language", () => {
  assert.equal(deletedMessage([{ label: "Klient: Piet" }], "af"), "Verwyder Klient: Piet");
  assert.equal(deletedMessage([{ label: "a" }, { label: "b" }], "af"), "2 items verwyder");
});
