import assert from "node:assert/strict";
import test from "node:test";

// A little page root and storage, enough for theme.js.
const makeRoot = () => {
  const classes = new Set();
  const vars = new Map();
  return {
    classes, vars,
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (n) => classes.has(n) },
    dataset: {},
    style: { setProperty: (k, v) => vars.set(k, v), removeProperty: (k) => vars.delete(k) },
  };
};
const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, String(v)), map };
};

const { applyAppearance, getScheme, getTheme, setScheme, setTheme } = await import("./theme.js");

test("the defaults: dark, and the original green scheme", () => {
  globalThis.localStorage = memory();
  assert.equal(getTheme(), "dark");
  assert.equal(getScheme(), "green");
});

test("choices are remembered and an unknown scheme falls back to the original", () => {
  globalThis.localStorage = memory();
  setScheme("barn", makeRoot());
  assert.equal(getScheme(), "barn");
  globalThis.localStorage.setItem("sandveld_scheme", "nonsense");
  assert.equal(getScheme(), "green");
});

test("applying a scheme sets its colours on the page and names it", () => {
  globalThis.localStorage = memory();
  const root = makeRoot();
  setTheme("light", root);
  setScheme("wheat", root);
  assert.equal(root.dataset.scheme, "wheat");
  assert.ok(!root.classes.has("theme-dark"));
  assert.match(root.vars.get("--color-emerald-600"), /^#[0-9a-f]{6}$/);
  assert.ok(!root.vars.has("--dk-bg"), "dark-only colours are not set in the light look");
});

test("switching the look and the scheme leaves no old colours behind", () => {
  globalThis.localStorage = memory();
  const root = makeRoot();
  setTheme("dark", root);
  setScheme("dam", root);
  assert.ok(root.classes.has("theme-dark") && root.vars.has("--dk-bg") && root.vars.has("--acc-text"));
  setTheme("light", root);
  assert.ok(!root.vars.has("--dk-bg") && !root.vars.has("--acc-text"));
  setScheme("green", root); // green is a full scheme too; nothing of the dam scheme or the dark look is left over
  assert.ok(root.vars.has("--color-emerald-600") && !root.vars.has("--dk-bg"));
  assert.notEqual(root.vars.get("--color-emerald-600"), "#10b981");
  assert.equal(root.dataset.scheme, "green");
});

test("storage being unavailable never stops the page from working", () => {
  globalThis.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const root = makeRoot();
  setScheme("karoo", root);
  setTheme("dark", root);
  applyAppearance(root);
  assert.equal(root.dataset.scheme, "karoo"); // remembered for this session even though it could not be saved
  assert.ok(root.classes.has("theme-dark"));
});
