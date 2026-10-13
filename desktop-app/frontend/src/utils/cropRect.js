// The crop box drawn over a brochure page (components/BrochureProducts.jsx). All numbers are canvas pixels.
const MIN_SIDE = 12; // smaller than this is a stray click, not a crop

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function cropRect(a, b, bounds) {
  const x1 = clamp(Math.min(a.x, b.x), 0, bounds.width);
  const y1 = clamp(Math.min(a.y, b.y), 0, bounds.height);
  const x2 = clamp(Math.max(a.x, b.x), 0, bounds.width);
  const y2 = clamp(Math.max(a.y, b.y), 0, bounds.height);
  const rect = { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
  return rect.w < MIN_SIDE || rect.h < MIN_SIDE ? null : rect;
}

// A pointer position on screen -> a pixel of the canvas, which is drawn at a different size than it really is.
export function toCanvasPoint(event, shown, bounds) {
  return {
    x: ((event.clientX - shown.left) * bounds.width) / shown.width,
    y: ((event.clientY - shown.top) * bounds.height) / shown.height,
  };
}

export const wholePage = (bounds) => ({ x: 0, y: 0, w: bounds.width, h: bounds.height });
