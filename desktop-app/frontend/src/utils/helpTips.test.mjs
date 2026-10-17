import test from "node:test";
import assert from "node:assert/strict";
import { tipFor, supportDetails } from "./helpTips.js";

test("each page gets its own tip", () => {
  assert.match(tipFor("/invoices"), /mark it paid/);
  assert.match(tipFor("/clients"), /Add a client/);
  assert.match(tipFor("/clients/12"), /Log a call/);
  assert.match(tipFor("/settings/email"), /Settings/);
  assert.match(tipFor("/"), /dashboard/);
  assert.match(tipFor("/setup"), /set-up guide/);
});

test("an unknown page still gets a useful tip", () => {
  assert.match(tipFor("/nowhere"), /search box/);
  assert.match(tipFor(undefined), /dashboard/);
});

test("the support details leave out ids and anything personal beyond the user's own name", () => {
  const text = supportDetails({ pathname: "/clients/42", version: "1.0.20", userName: "Anna", language: "af", when: new Date("2026-10-17T08:00:00Z") });
  assert.match(text, /Page: \/clients\/#/);
  assert.ok(!text.includes("42"));
  assert.match(text, /Version: 1\.0\.20/);
  assert.match(text, /Signed in as: Anna/);
  assert.match(text, /2026-10-17T08:00:00/);
});
