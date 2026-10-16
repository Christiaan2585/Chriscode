import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_SIZE, pageInfo } from "./usePaged.js";

test("a short list shows everything and has nothing more", () => {
  assert.deepEqual(pageInfo(40, PAGE_SIZE), { shown: 40, more: 0, next: 0 });
});

test("a long list shows one page and says how many more", () => {
  assert.deepEqual(pageInfo(3000, 100), { shown: 100, more: 2900, next: 100 });
});

test("the last page offers only what is left", () => {
  assert.deepEqual(pageInfo(250, 200), { shown: 200, more: 50, next: 50 });
  assert.deepEqual(pageInfo(250, 300), { shown: 250, more: 0, next: 0 });
});
