import test from "node:test";
import assert from "node:assert/strict";
import { orderListText, supplierOrderMessage } from "./supplierOrder.js";

const base = {
  business: { trading_name: "Sandveld Vee Dienste", phone: "082 555 0123" },
  supplier: { name: "Kyron Agri", contact_person: "Marie" },
  po: { number: "PO0000004", delivery_date: "2026-11-03T00:00:00", notes: "Deliver to the farm gate, Prieska road", reference: "Winter stock" },
  lines: [{ description: "D5 - Dip 5 l (4 x 5 l)", quantity: 17 }, { description: "Ear tag", quantity: 2.5 }],
  rep: { name: "Nico", phone: "082 111 2222" },
};

test("the list has one line per product with its amount", () => {
  assert.equal(orderListText(base.lines), "17 x D5 - Dip 5 l (4 x 5 l)\n2.5 x Ear tag");
});

test("the message names the order, the list, the date and where to deliver", () => {
  const text = supplierOrderMessage(base);
  assert.match(text, /^Good day Marie,/);
  assert.match(text, /Sandveld Vee Dienste/);
  assert.match(text, /17 x D5 - Dip 5 l \(4 x 5 l\)/);
  assert.match(text, /Order number: PO0000004/);
  assert.match(text, /Reference: Winter stock/);
  assert.match(text, /Needed by: 3 Nov 2026/);
  assert.match(text, /Deliver to: Deliver to the farm gate, Prieska road/);
  assert.match(text, /Nico, 082 111 2222/);
});

test("a note that already says where to deliver is not prefixed twice", () => {
  const text = supplierOrderMessage({ ...base, po: { ...base.po, notes: "Deliver to: Plot 7, Prieska" } });
  assert.match(text, /^Deliver to: Plot 7, Prieska$/m);
  assert.doesNotMatch(text, /Deliver to: Deliver to/);
});

test("without a contact person the supplier's name is used, and missing details are simply left out", () => {
  const text = supplierOrderMessage({ ...base, supplier: { name: "Kyron Agri" }, po: { number: "PO0000005" }, rep: {} });
  assert.match(text, /^Good day Kyron Agri,/);
  assert.doesNotMatch(text, /Needed by|Deliver to|Reference/);
  assert.match(text, /Sandveld Vee Dienste, 082 555 0123$/);
});

test("it can be written in Afrikaans", () => {
  const text = supplierOrderMessage({ ...base, lang: "af" });
  assert.match(text, /^Goeie dag Marie,/);
  assert.match(text, /Bestelling nommer: PO0000004/);
  assert.match(text, /Benodig teen: 3 Nov 2026/);
});
