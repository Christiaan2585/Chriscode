// "Magnetic" selection for the brochure screen (components/BrochureProducts.jsx): inside the box the user drew, find
// the product's own outline so the cut-out follows it instead of the box.
//
// How it works - plain colour maths, no AI: the colours around the edge of the box are taken to be the background
// (up to four of them, so a dark head next to an orange band works); every pixel clearly different from all of them
// belongs to the product; the biggest connected piece is kept, holes in it (a dark label on a white jar) are filled,
// and the edge is smoothed. Returns null when nothing sensible is found, so the caller falls back to the plain box.
const MIN_SHARE = 0.03; // the product must fill at least this much of the box ...
const MAX_SHARE = 0.97; // ... and not all of it
const DEFAULT_THRESHOLD = 60; // colour distance (0-441) from every background colour that counts as "product"

function blur3(data, width, height) {
  const out = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const i = (yy * width + xx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
        }
      }
      const o = (y * width + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

// The colours along the edge of the box that cover a real share of it.
function backgroundColours(rgb, width, height) {
  const ring = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const buckets = new Map();
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= ring && y >= ring && x < width - ring && y < height - ring) continue;
      const o = (y * width + x) * 3;
      const key = (rgb[o] >> 5) * 64 + (rgb[o + 1] >> 5) * 8 + (rgb[o + 2] >> 5);
      const s = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      s.n += 1; s.r += rgb[o]; s.g += rgb[o + 1]; s.b += rgb[o + 2];
      buckets.set(key, s);
      total += 1;
    }
  }
  return [...buckets.values()]
    .filter((s) => s.n >= total * 0.05)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((s) => [s.r / s.n, s.g / s.n, s.b / s.n]);
}

function biggestPiece(candidate, width, height) {
  const label = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  let best = { id: 0, size: 0 };
  let next = 0;
  for (let start = 0; start < candidate.length; start += 1) {
    if (!candidate[start] || label[start]) continue;
    next += 1;
    let size = 0; let top = 0;
    stack[top++] = start; label[start] = next;
    while (top) {
      const p = stack[--top];
      size += 1;
      const x = p % width; const y = (p / width) | 0;
      if (x > 0 && candidate[p - 1] && !label[p - 1]) { label[p - 1] = next; stack[top++] = p - 1; }
      if (x < width - 1 && candidate[p + 1] && !label[p + 1]) { label[p + 1] = next; stack[top++] = p + 1; }
      if (y > 0 && candidate[p - width] && !label[p - width]) { label[p - width] = next; stack[top++] = p - width; }
      if (y < height - 1 && candidate[p + width] && !label[p + width]) { label[p + width] = next; stack[top++] = p + width; }
    }
    if (size > best.size) best = { id: next, size };
  }
  const mask = new Uint8Array(width * height);
  if (best.id) for (let i = 0; i < mask.length; i += 1) if (label[i] === best.id) mask[i] = 1;
  return mask;
}

// Anything not reachable from the edge of the box without crossing the product is inside it (a hole) - fill it.
function fillHoles(mask, width, height) {
  const outside = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;
  const push = (p) => { if (!mask[p] && !outside[p]) { outside[p] = 1; stack[top++] = p; } };
  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { push(y * width); push(y * width + width - 1); }
  while (top) {
    const p = stack[--top];
    const x = p % width; const y = (p / width) | 0;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i += 1) out[i] = outside[i] ? 0 : 1;
  return out;
}

// One pixel off every edge: the noise-smoothing above spreads the product a pixel into the background.
function erode(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      out[p] = mask[p] && mask[p - 1] && mask[p + 1] && mask[p - width] && mask[p + width] ? 1 : 0;
    }
  }
  return out;
}

// Majority of the 3x3 neighbourhood: removes spikes and ragged edges.
function smooth(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < width && yy < height) n += mask[yy * width + xx];
        }
      }
      out[y * width + x] = n >= 5 ? 1 : 0;
    }
  }
  return out;
}

export function snapOutline({ data, width, height }, { threshold = DEFAULT_THRESHOLD } = {}) {
  const rgb = blur3(data, width, height);
  const background = backgroundColours(rgb, width, height);
  if (!background.length) return null;
  const candidate = new Uint8Array(width * height);
  for (let i = 0; i < candidate.length; i += 1) {
    const r = rgb[i * 3]; const g = rgb[i * 3 + 1]; const b = rgb[i * 3 + 2];
    let nearest = Infinity;
    for (const [br, bg, bb] of background) nearest = Math.min(nearest, Math.hypot(r - br, g - bg, b - bb));
    candidate[i] = nearest > threshold ? 1 : 0;
  }
  let mask = biggestPiece(candidate, width, height);
  mask = fillHoles(mask, width, height);
  mask = smooth(smooth(erode(mask, width, height), width, height), width, height);

  let area = 0; let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      area += 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const share = area / (width * height);
  if (share < MIN_SHARE || share > MAX_SHARE) return null;
  return { mask, width, height, bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}
