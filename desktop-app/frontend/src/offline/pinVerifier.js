// Checks a 5-digit PIN on the phone itself, for the times the office PC cannot be reached.
// Only a salted PBKDF2 hash is ever stored (and that sits inside the Keystore-sealed store, see
// offlineLogin.js) - never the PIN.
const enc = new TextEncoder();
const DEFAULT_ITERATIONS = 200000;

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function makeVerifier(pin, { iterations = DEFAULT_ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { v: 1, iterations, salt: toBase64(salt), hash: toBase64(await derive(pin, salt, iterations)) };
}

export async function checkPin(pin, verifier) {
  if (!pin || !verifier?.salt || !verifier?.hash) return false;
  const actual = await derive(pin, fromBase64(verifier.salt), verifier.iterations || DEFAULT_ITERATIONS);
  const expected = fromBase64(verifier.hash);
  let diff = actual.length ^ expected.length; // compare everything, not stopping at the first difference
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ (expected[i] ?? 0);
  return diff === 0;
}
