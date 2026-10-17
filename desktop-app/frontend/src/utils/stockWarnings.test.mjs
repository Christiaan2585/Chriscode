import test from "node:test";
import assert from "node:assert/strict";
import { stockShortfalls, shortfallText } from "./stockWarnings.js";

const products = [
  { id: 1, name: "Drench", stock_quantity: 5 },
  { id: 2, name: "Tags", stock_quantity: 0 },
  { id: 3, name: "Uncounted", stock_quantity: null },
];

test("a line selling more than is counted is flagged", () => {
  assert.deepEqual(stockShortfalls([{ product_id: 1, quantity: 8 }], products), [{ product_id: 1, name: "Drench", wanted: 8, have: 5 }]);
});

test("selling exactly what is on the shelf is fine", () => {
  assert.deepEqual(stockShortfalls([{ product_id: 1, quantity: 5 }], products), []);
});

test("two lines for the same product add up", () => {
  const out = stockShortfalls([{ product_id: 1, quantity: 3 }, { product_id: 1, quantity: 3 }], products);
  assert.equal(out[0].wanted, 6);
});

test("products that are not counted never warn, and empty or bad lines are ignored", () => {
  assert.deepEqual(stockShortfalls([{ product_id: 3, quantity: 99 }, { product_id: 1, quantity: 0 }, { product_id: "", quantity: 4 }, { product_id: 99, quantity: 1 }], products), []);
  assert.deepEqual(stockShortfalls(undefined, undefined), []);
});

test("the words say none or only some", () => {
  assert.match(shortfallText({ name: "Tags", have: 0, wanted: 2 }), /none on the shelf/);
  assert.match(shortfallText({ name: "Drench", have: 5, wanted: 8 }), /only 5 on the shelf/);
});
