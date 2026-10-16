import test from "node:test";
import assert from "node:assert/strict";
import { AF } from "./translations.af.js";
import { LANGUAGES, cleanLanguage, translate } from "./i18n.js";

test("English is the default and returns the text unchanged", () => {
  assert.equal(translate("Clients", "en"), "Clients");
  assert.equal(translate("Anything not in the dictionary", "af"), "Anything not in the dictionary");
});

test("Afrikaans comes from the dictionary", () => {
  assert.equal(translate("Clients", "af"), "Kliënte");
  assert.equal(translate("Save", "af"), "Stoor");
});

test("{placeholders} are filled in, in either language", () => {
  assert.equal(translate("Showing {shown} of {total}", "en", { shown: 100, total: 3000 }), "Showing 100 of 3000");
  assert.equal(translate("Showing {shown} of {total}", "af", { shown: 100, total: 3000 }), "Wys 100 van 3000");
  assert.equal(translate("Hello {name}", "af", { name: "Piet" }), "Hello Piet"); // not translated, still filled
});

test("only known languages are accepted", () => {
  assert.deepEqual(LANGUAGES.map((l) => l.id), ["en", "af"]);
  assert.equal(cleanLanguage("af"), "af");
  assert.equal(cleanLanguage("fr"), "en");
  assert.equal(cleanLanguage(undefined), "en");
});

test("every translation is filled in and keeps the placeholders of its English text", () => {
  const bad = [];
  for (const [english, afrikaans] of Object.entries(AF)) {
    if (!english.trim() || typeof afrikaans !== "string" || !afrikaans.trim()) { bad.push(`empty: ${english}`); continue; }
    const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
    if (holes(english) !== holes(afrikaans)) bad.push(`placeholders differ: ${english}`);
  }
  assert.deepEqual(bad, []);
});

test("a translation is not just the English text again", () => {
  // Words that really are the same in both languages are allowed in this short list.
  const same = new Set(["Email", "Reports", "Status", "Weather", "Admin", "Staff", "Total", "Dashboard", "Kyron Agri", "VAT", "PDF", "Excel", "OK", "Photos", "Orders", "Stock", "Menu", "Programs", "Calendar", "Product", "Produkte"]);
  const repeated = Object.entries(AF).filter(([en, af]) => en === af && !same.has(en)).map(([en]) => en);
  assert.deepEqual(repeated, []);
});
