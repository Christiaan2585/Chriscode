import test from "node:test";
import assert from "node:assert/strict";
import { deleteConfirm } from "./confirmText.js";

test("a delete says what goes with it and how to get it back", () => {
  const text = deleteConfirm("invoice INV0000012", "Its lines, payments and credit notes go with it.");
  assert.match(text, /^Delete invoice INV0000012\?/);
  assert.match(text, /lines, payments and credit notes go with it\./);
  assert.match(text, /undo it straight after/);
  assert.match(text, /Recycle bin/);
});

test("without extra detail it is still clear", () => {
  const text = deleteConfirm('"Piet"');
  assert.match(text, /^Delete "Piet"\? You can undo/);
});
