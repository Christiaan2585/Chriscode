import test from "node:test";
import assert from "node:assert/strict";
import { goPath } from "./deepLink.js";

test("the shortcuts open their page, with the add form where asked", () => {
  assert.equal(goPath("sandveld://go/clients?new=1"), "/clients?new=1");
  assert.equal(goPath("sandveld://go/invoices?new=1"), "/invoices?new=1");
  assert.equal(goPath("sandveld://go/programs"), "/programs");
  assert.equal(goPath("sandveld://go/calendar"), "/calendar");
  assert.equal(goPath("sandveld://go/"), "/");
});

test("anything else is refused", () => {
  assert.equal(goPath("sandveld://pair?d=abc"), null);
  assert.equal(goPath("https://go/clients"), null);
  assert.equal(goPath("sandveld://go/settings/email"), null);
  assert.equal(goPath("sandveld://go/clients/../settings"), null);
  assert.equal(goPath("not a url"), null);
});

test("only new=1 is carried over", () => {
  assert.equal(goPath("sandveld://go/clients?new=1&evil=1"), "/clients?new=1");
  assert.equal(goPath("sandveld://go/clients?new=2"), "/clients");
  assert.equal(goPath("sandveld://go/calendar?new=1"), "/calendar");
});
