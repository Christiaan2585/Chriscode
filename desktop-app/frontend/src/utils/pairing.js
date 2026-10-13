// Android only: pairing with the office PC over the LAN (see
// app/core/lan.py / app/api/devices.py). The actual trust decision - which
// certificate fingerprint this phone pins - lives natively (PairingStore.kt
// equivalent, PinningWebViewClient) because it has to be available
// synchronously during the TLS handshake, before any JS runs. This module
// is just the JS-side way to read and write that same store.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { acceptableRelay } from "./addresses.js";

export const PairingStorePlugin = registerPlugin("PairingStore");

export const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// Outside the Android app (dev, Electron, the Streamlit dashboard) there's
// nothing to pair - always report paired so callers never show a pairing
// screen anywhere but the phone.
export async function getPairing() {
  if (!isNative()) return null;
  const result = await PairingStorePlugin.get();
  return result?.paired ? result : null;
}

// Pins a host's certificate before the pairing call itself is made, which
// also needs the TLS handshake trusted - there's no token yet at that point.
export async function trustHost(host, port, fingerprint) {
  await PairingStorePlugin.trust({ host, port, fingerprint });
}

// `hosts` = every address the PC offered: the phone remembers all of them and uses whichever answers.
export async function savePairing(host, port, fingerprint, token, deviceName, hosts = [host], relay = null) {
  await PairingStorePlugin.save({ host, port, fingerprint, token, deviceName, hosts });
  await keepRelay(relay);
}

// The internet relay the PC offers ("Connect from anywhere"). null/undefined = the PC does not offer one (any old one is
// dropped); anything that is not well formed is ignored, here and again in the phone's own code.
export async function keepRelay(offer) {
  const relay = acceptableRelay(offer);
  if (relay) await PairingStorePlugin.setRelay(relay);
  else if (offer === null) await PairingStorePlugin.clearRelay();
}

export async function clearPairing() {
  if (isNative()) await PairingStorePlugin.clear();
}

// The PC's QR code (see devices.py's /devices/pairing) encodes
// sandveld://pair?d=<base64url JSON> rather than bare JSON, so any camera
// app offers "open in Sandveld" - decode that back into {hosts, port, fp, code}.
export function decodePairingLink(url) {
  const match = /[?&]d=([^&]+)/.exec(url || "");
  if (!match) return null;
  try {
    let base64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const json = decodeURIComponent(escape(atob(base64)));
    const data = JSON.parse(json);
    return data?.app === "sandveld" ? data : null;
  } catch {
    return null;
  }
}
