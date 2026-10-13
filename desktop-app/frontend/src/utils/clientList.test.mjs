import test from "node:test";
import assert from "node:assert/strict";
import { NO_TOWN, filterAndSort, townsOf } from "./clientList.js";

const jan = { id: 1, name: "Jan Smit", farm_name: "Rietvlei", town: "Prieska" };
const piet = { id: 2, name: "Piet Botha", farm_name: "Kuilfontein", town: "carnarvon" };
const sue = { id: 3, name: "Sue Nel", farm_name: null, town: null };
const ann = { id: 4, name: "Ann Joubert", farm_name: "Aloe Plaas", town: " Prieska " };
const ALL = [jan, piet, sue, ann];
const HEAD = { 1: 420, 2: 90, 4: 1500 }; // Sue has no headcount
const ids = (list) => list.map((c) => c.id);
const run = (options) => ids(filterAndSort(ALL, HEAD, options));

test("by default everyone, sorted by farm name", () => {
  assert.deepEqual(run({}), [4, 2, 1, 3]); // Aloe, Kuilfontein, Rietvlei, Sue Nel (no farm: her own name)
});

test("towns are listed once, tidied up and in order", () => {
  assert.deepEqual(townsOf(ALL), ["carnarvon", "Prieska"]);
});

test("filtering by a town ignores capitals and stray spaces", () => {
  assert.deepEqual(run({ town: "prieska" }).sort(), [1, 4]);
  assert.deepEqual(run({ town: "CARNARVON" }), [2]);
});

test("clients with no town can be picked on their own", () => {
  assert.deepEqual(run({ town: NO_TOWN }), [3]);
});

test("a minimum and maximum number of animals", () => {
  assert.deepEqual(run({ minAnimals: 400 }).sort(), [1, 4]);
  assert.deepEqual(run({ maxAnimals: 500 }).sort(), [1, 2]);
  assert.deepEqual(run({ minAnimals: 100, maxAnimals: 1000 }), [1]);
});

test("a client whose animals are not recorded is left out once an animal limit is set", () => {
  assert.ok(!run({ minAnimals: 0 }).includes(3));
  assert.ok(run({}).includes(3));
});

test("sorting by animals puts the biggest (or smallest) first and the unknown last", () => {
  assert.deepEqual(run({ sort: "animals-high" }), [4, 1, 2, 3]);
  assert.deepEqual(run({ sort: "animals-low" }), [2, 1, 4, 3]);
});

test("sorting by town goes A to Z, clients without a town last, then by name", () => {
  assert.deepEqual(run({ sort: "town" }), [2, 4, 1, 3]);
});

test("the search also finds a town", () => {
  assert.deepEqual(run({ search: "carnar" }), [2]);
});

test("the filters and the sort work together", () => {
  assert.deepEqual(run({ town: "Prieska", sort: "animals-low" }), [1, 4]);
});

test("a blank limit means no limit", () => {
  assert.equal(run({ minAnimals: "", maxAnimals: "" }).length, 4);
});
