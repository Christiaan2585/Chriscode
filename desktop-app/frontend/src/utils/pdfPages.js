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
