import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.mjs";

// pdf.js runs its worker code in this thread (it finds it on globalThis.pdfjsWorker) instead of starting a Web
// Worker, so the packaged app's strict CSP and file:// pages need nothing extra. A brochure page at a time is fast
// enough that nobody notices.
globalThis.pdfjsWorker = pdfWorker;

export const openPdf = async (blob) => pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;

// Draws page `number` (1-based) onto `canvas`, `width` pixels wide - wide enough to crop a product out of it later.
export async function drawPage(doc, number, canvas, width = 1400) {
  const page = await doc.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
}

// The pixels inside `rect`, shrunk to at most `maxSide` on the long side, for snapOutline() - small is plenty to find
// an edge and keeps it instant.
export function sampleRegion(canvas, rect, maxSide = 360) {
  const scale = Math.min(1, maxSide / Math.max(rect.w, rect.h));
  const w = Math.max(1, Math.round(rect.w * scale));
  const h = Math.max(1, Math.round(rect.h * scale));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// A small canvas holding the found shape: `colour` where the product is (or only along its edge), clear elsewhere.
function shapeCanvas(snap, colour, edgeOnly) {
  const c = document.createElement("canvas");
  c.width = snap.width;
  c.height = snap.height;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(snap.width, snap.height);
  const { mask, width, height } = snap;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (!mask[p]) continue;
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - width] || !mask[p + width];
      if (edgeOnly && !edge) continue;
      img.data.set([...colour, 255], p * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Dims everything except the found product and traces its outline - what the user sees "snap" to the product.
export function drawOutline(overlay, pageCanvas, rect, snap) {
  overlay.width = pageCanvas.width;
  overlay.height = pageCanvas.height;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!snap || !rect) return; // the box can be cleared a moment before the outline is
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, overlay.width, overlay.height);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(shapeCanvas(snap, [0, 0, 0], false), rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(shapeCanvas(snap, [52, 211, 153], true), rect.x, rect.y, rect.w, rect.h);
}

// The product cut out along the found outline, on white, as a JPEG file (only the product's own bounding box).
export function cutOutToFile(canvas, rect, snap, name = "product.jpg") {
  const sx = rect.w / snap.width;
  const sy = rect.h / snap.height;
  const pad = 4;
  const bx = Math.max(0, Math.floor(snap.bbox.x * sx) - pad);
  const by = Math.max(0, Math.floor(snap.bbox.y * sy) - pad);
  const bw = Math.min(rect.w - bx, Math.ceil(snap.bbox.w * sx) + 2 * pad);
  const bh = Math.min(rect.h - by, Math.ceil(snap.bbox.h * sy) + 2 * pad);

  const piece = document.createElement("canvas");
  piece.width = bw;
  piece.height = bh;
  const pctx = piece.getContext("2d");
  pctx.drawImage(canvas, rect.x + bx, rect.y + by, bw, bh, 0, 0, bw, bh);
  pctx.globalCompositeOperation = "destination-in"; // keep the picture only where the mask is
  pctx.imageSmoothingEnabled = true;
  pctx.drawImage(shapeCanvas(snap, [0, 0, 0], false), -bx, -by, rect.w, rect.h);

  const out = document.createElement("canvas");
  out.width = bw;
  out.height = bh;
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff"; // JPEG has no transparency
  octx.fillRect(0, 0, bw, bh);
  octx.drawImage(piece, 0, 0);
  return new Promise((resolve, reject) =>
    out.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("Could not cut out the picture"))), "image/jpeg", 0.92));
}

// The chosen part of the canvas as a JPEG file ready for PUT /products/{id}/image.
export function cropToFile(canvas, rect, name = "product.jpg") {
  const out = document.createElement("canvas");
  out.width = rect.w;
  out.height = rect.h;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, rect.w, rect.h);
  ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return new Promise((resolve, reject) =>
    out.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("Could not cut out the picture"))), "image/jpeg", 0.92));
}
