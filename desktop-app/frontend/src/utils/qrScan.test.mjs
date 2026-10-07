// Run: node --test src/utils/qrScan.test.mjs (from desktop-app/frontend)
import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { readQr } from "./qrScan.js";
import { decodePairingLink } from "./pairing.js";

// What the PC's pairing dialog encodes (devices.py): sandveld://pair?d=<base64url JSON>.
const pairingLink = (payload) =>
  "sandveld://pair?d=" + Buffer.from(JSON.stringify(payload)).toString("base64url");

// A QR code as the RGBA pixels a camera frame would give: black modules on
// white, with the quiet border, each module drawn `scale` pixels wide.
const frameOf = (text, scale = 6) => {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const border = 4;
  const size = (n + border * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + border) * scale + dy) * size + (x + border) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width: size, height: size };
};

test("reads the pairing QR the PC shows, and it decodes to the pairing details", () => {
  const payload = { app: "sandveld", v: 1, hosts: ["192.168.1.20"], port: 8443, fp: "ab12", code: "123456" };
  const text = readQr(frameOf(pairingLink(payload)));
  assert.equal(text, pairingLink(payload));
  assert.deepEqual(decodePairingLink(text), payload);
});

test("a frame with no QR code in it reads as nothing", () => {
  const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
  assert.equal(readQr(blank), null);
});

test("someone else's QR code is read, but is not a pairing code", () => {
  const text = readQr(frameOf("https://example.com/win-a-prize"));
  assert.equal(text, "https://example.com/win-a-prize");
  assert.equal(decodePairingLink(text), null);
});
