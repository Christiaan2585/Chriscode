// Run: node --test src/utils/useSelection.test.mjs (from desktop-app/frontend)
import test from "node:test";
import assert from "node:assert/strict";
import { deleteMany } from "./useSelection.js";

const refuses = (detail) => Object.assign(new Error("409"), { response: { data: { detail } } });

test("everything that can be deleted is, in order", async () => {
  const seen = [];
  const out = await deleteMany([3, 1, 2], async (id) => { seen.push(id); });
  assert.deepEqual(seen, [3, 1, 2]);
  assert.deepEqual(out, { deleted: 3, failed: [] });
});

test("a record that refuses is reported with its reason and the rest still go", async () => {
  const out = await deleteMany([1, 2, 3], async (id) => {
    if (id === 2) throw refuses("Oom Piet has 2 invoices.");
  });
  assert.equal(out.deleted, 2);
  assert.deepEqual(out.failed, [{ id: 2, reason: "Oom Piet has 2 invoices." }]);
});

test("an error with no readable reason still gets a plain one", async () => {
  const out = await deleteMany([1, 2], async (id) => {
    if (id === 1) throw new Error("Network Error");
    if (id === 2) throw refuses([{ msg: "validation shape" }]);
  });
  assert.equal(out.deleted, 0);
  assert.deepEqual(out.failed.map((f) => f.reason), ["It couldn't be deleted.", "It couldn't be deleted."]);
});

test("nothing selected does nothing", async () => {
  assert.deepEqual(await deleteMany([], async () => { throw new Error("never"); }), { deleted: 0, failed: [] });
});
