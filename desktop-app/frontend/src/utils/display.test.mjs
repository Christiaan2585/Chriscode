import test from "node:test";
import assert from "node:assert/strict";
import { TEXT_SIZES, cleanContrast, cleanTextSize, sizePercent } from "./display.js";

test("the three text sizes scale the whole app from the page's base size", () => {
  assert.deepEqual(TEXT_SIZES.map((s) => s.id), ["normal", "large", "xlarge"]);
  assert.equal(sizePercent("normal"), 100);
  assert.equal(sizePercent("large"), 112.5);
  assert.equal(sizePercent("xlarge"), 125);
});

test("anything else falls back to normal", () => {
  assert.equal(cleanTextSize("huge"), "normal");
  assert.equal(cleanTextSize(undefined), "normal");
  assert.equal(cleanTextSize("large"), "large");
  assert.equal(sizePercent("nonsense"), 100);
  assert.equal(cleanContrast("high"), "high");
  assert.equal(cleanContrast("whatever"), "normal");
});
