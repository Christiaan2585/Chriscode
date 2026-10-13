import test from "node:test";
import assert from "node:assert/strict";
import { snapOutline } from "./snapOutline.js";

// Builds a width x height RGBA picture; paint(x, y) returns [r, g, b].
function picture(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const BLACK = [10, 10, 12];
const WHITE = [240, 240, 240];
const ORANGE = [235, 130, 20];
const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const area = (mask) => mask.reduce((n, v) => n + (v ? 1 : 0), 0);

// How much of the true shape the mask covers, and how much it spills outside it (0..1 each).
function overlap(mask, width, height, inside) {
  let hit = 0; let truth = 0; let spill = 0; let found = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const m = mask[y * width + x] === 1;
      const t = inside(x, y);
      if (t) { truth += 1; if (m) hit += 1; }
      if (m) { found += 1; if (!t) spill += 1; }
    }
  }
  return { covered: hit / truth, spilled: found ? spill / found : 0 };
}

test("a light jar on a dark background is outlined closely", () => {
  const jar = disc(60, 70, 30);
  const pic = picture(120, 140, (x, y) => (jar(x, y) ? WHITE : BLACK));
  const out = snapOutline(pic);
  const { covered, spilled } = overlap(out.mask, 120, 140, jar);
  assert.ok(covered > 0.97, `covered ${covered}`);
  assert.ok(spilled < 0.05, `spilled ${spilled}`);
  assert.ok(out.bbox.w >= 58 && out.bbox.w <= 66, `width ${out.bbox.w}`);
});

test("a dark label inside the product does not leave a hole", () => {
  const jar = disc(60, 70, 32);
  const label = disc(60, 70, 14);
  const pic = picture(120, 140, (x, y) => (label(x, y) ? BLACK : jar(x, y) ? WHITE : BLACK));
  const out = snapOutline(pic);
  assert.equal(out.mask[70 * 120 + 60], 1);
  assert.ok(overlap(out.mask, 120, 140, jar).covered > 0.97);
});

test("a background made of two colours is still left out", () => {
  const box = (x, y) => x > 40 && x < 80 && y > 30 && y < 110;
  const pic = picture(120, 140, (x, y) => (box(x, y) ? WHITE : x < 60 ? BLACK : ORANGE));
  const out = snapOutline(pic);
  const { covered, spilled } = overlap(out.mask, 120, 140, box);
  assert.ok(covered > 0.95 && spilled < 0.06, `covered ${covered} spilled ${spilled}`);
});

test("nothing to find in a plain area", () => {
  assert.equal(snapOutline(picture(80, 80, () => BLACK)), null);
});

test("a looser setting finds a faint product that a stricter one misses", () => {
  const faint = disc(50, 50, 25);
  const pic = picture(100, 100, (x, y) => (faint(x, y) ? [60, 60, 66] : BLACK));
  assert.equal(snapOutline(pic, { threshold: 120 }), null);
  const out = snapOutline(pic, { threshold: 30 });
  assert.ok(out && area(out.mask) > 1500);
});

test("specks of noise are not mistaken for the product", () => {
  const jar = disc(60, 70, 30);
  const pic = picture(120, 140, (x, y) => (jar(x, y) ? WHITE : (x * 7 + y * 13) % 97 === 0 ? [120, 120, 120] : BLACK));
  const out = snapOutline(pic);
  assert.ok(overlap(out.mask, 120, 140, jar).spilled < 0.08);
});
