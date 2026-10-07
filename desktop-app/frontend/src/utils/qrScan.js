import jsQR from "jsqr";

// The text of the QR code in one camera frame ({data: RGBA pixels, width, height}),
// or null when there isn't one (yet).
export function readQr({ data, width, height }) {
  return jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
}
