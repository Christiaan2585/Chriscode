import test from "node:test";
import assert from "node:assert/strict";
import { cropRect, toCanvasPoint, wholePage } from "./cropRect.js";

const BOX = { width: 1000, height: 1400 };

test("a box dragged in any direction gives the same rectangle", () => {
  const want = { x: 100, y: 200, w: 300, h: 400 };
  assert.deepEqual(cropRect({ x: 100, y: 200 }, { x: 400, y: 600 }, BOX), want);
  assert.deepEqual(cropRect({ x: 400, y: 600 }, { x: 100, y: 200 }, BOX), want);
  assert.deepEqual(cropRect({ x: 400, y: 200 }, { x: 100, y: 600 }, BOX), want);
});

test("a drag that leaves the page is held at the page edge", () => {
  assert.deepEqual(cropRect({ x: 900, y: 1300 }, { x: 1500, y: 2000 }, BOX), { x: 900, y: 1300, w: 100, h: 100 });
  assert.deepEqual(cropRect({ x: -50, y: -50 }, { x: 60, y: 70 }, BOX), { x: 0, y: 0, w: 60, h: 70 });
});

test("a tiny accidental click is not a crop", () => {
  assert.equal(cropRect({ x: 100, y: 100 }, { x: 103, y: 104 }, BOX), null);
});

test("screen points are turned into canvas pixels", () => {
  // the canvas is drawn 500 px wide on screen but is 1000 px wide inside
  const shown = { left: 20, top: 10, width: 500, height: 700 };
  assert.deepEqual(toCanvasPoint({ clientX: 120, clientY: 110 }, shown, BOX), { x: 200, y: 200 });
});

test("the whole page is a crop too", () => {
  assert.deepEqual(wholePage(BOX), { x: 0, y: 0, w: 1000, h: 1400 });
});
