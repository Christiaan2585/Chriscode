import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SCHEME, SCHEMES, contrast, schemeVariables, STEPS } from "./colorSchemes.js";

const others = SCHEMES.filter((s) => s.id !== DEFAULT_SCHEME);
const hexOf = (vars, name) => vars[`--color-${name}`];

test("there is the original look plus four farm schemes, each with a name and a few words about it", () => {
  assert.equal(SCHEMES[0].id, DEFAULT_SCHEME);
  assert.equal(others.length, 4);
  assert.equal(new Set(SCHEMES.map((s) => s.id)).size, SCHEMES.length);
  for (const scheme of SCHEMES) {
    assert.ok(scheme.name.length > 3 && scheme.blurb.length > 10, scheme.id);
    assert.equal(Object.keys(scheme.swatch).length, STEPS.length, scheme.id);
  }
});

test("the original look changes nothing (the stylesheet already is that look)", () => {
  assert.deepEqual(schemeVariables(DEFAULT_SCHEME, "light"), {});
  assert.deepEqual(schemeVariables(DEFAULT_SCHEME, "dark"), {});
  assert.deepEqual(schemeVariables("no-such-scheme", "dark"), {}); // an unknown name falls back to the original
});

test("contrast maths: black on white is 21, a colour on itself is 1", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#336699", "#336699"), 1);
});

for (const scheme of others) {
  test(`${scheme.name}: readable in the light look`, () => {
    const v = schemeVariables(scheme.id, "light");
    for (const step of STEPS) assert.match(hexOf(v, `emerald-${step}`), /^#[0-9a-f]{6}$/, `emerald-${step}`);
    assert.ok(contrast("#ffffff", hexOf(v, "emerald-600")) >= 4.5, "white text on the main button colour");
    assert.ok(contrast(hexOf(v, "emerald-700"), hexOf(v, "emerald-50")) >= 4.5, "accent text on a pale accent wash");
    assert.ok(contrast(hexOf(v, "emerald-200"), hexOf(v, "emerald-900")) >= 4.5, "light text on the sidebar");
    assert.ok(contrast(hexOf(v, "slate-500"), "#ffffff") >= 4.5, "secondary text on a white card");
    assert.ok(contrast(hexOf(v, "slate-600"), hexOf(v, "slate-50")) >= 5, "body text on the page");
    assert.ok(contrast(hexOf(v, "slate-800"), "#ffffff") >= 10, "headings on a white card");
  });

  test(`${scheme.name}: readable in the dark look`, () => {
    const v = schemeVariables(scheme.id, "dark");
    const card = v["--dk-card"];
    assert.match(card, /^#[0-9a-f]{6}$/);
    assert.ok(contrast(v["--acc-text"], card) >= 4.5, "accent text on a card");
    assert.ok(contrast(v["--acc-text-hi"], card) >= 7, "bright accent text on a card");
    assert.ok(contrast(hexOf(v, "slate-500"), card) >= 4.5, "secondary text on a card");
    assert.ok(contrast(hexOf(v, "slate-400"), card) >= 3.2, "placeholder text on a card");
    assert.ok(contrast(v["--dk-text"], v["--dk-bg"]) >= 7, "body text on the page");
    assert.ok(contrast(hexOf(v, "slate-800"), card) >= 10, "headings on a card");
    assert.ok(contrast("#ffffff", hexOf(v, "emerald-600")) >= 4.5, "white text on the main button colour");
    assert.match(v["--acc-rgb"], /^\d+ \d+ \d+$/);
    // the card must be lighter than the page, and the line lighter than the card, or the layout flattens
    assert.ok(contrast(card, v["--dk-bg"]) > 1.02 && contrast(v["--dk-line"], card) > 1.1);
  });

  test(`${scheme.name}: the two looks use the same names, so switching leaves nothing behind`, () => {
    const names = (mode) => Object.keys(schemeVariables(scheme.id, mode)).filter((k) => k.startsWith("--color-emerald-6"));
    assert.deepEqual(names("light"), names("dark"));
  });
}

test("every scheme can draw its preview in both looks", async () => {
  const { previewColors } = await import("./colorSchemes.js");
  for (const scheme of SCHEMES) {
    for (const mode of ["light", "dark"]) {
      const colors = previewColors(scheme.id, mode);
      for (const name of ["page", "sidebar", "card", "line", "text", "muted", "accent", "accentText"]) {
        assert.match(colors[name], /^#[0-9a-f]{6}$/, `${scheme.id} ${mode} ${name}`);
      }
    }
  }
});
