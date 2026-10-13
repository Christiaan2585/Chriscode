// What kind of address is it? Used by the phone's connection check and the PC's Phones settings.
const parts = (host) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host).trim());
  return m ? m.slice(1).map(Number) : null;
};

// Tailscale hands out 100.64.0.0/10 addresses: they work from anywhere, not just the office Wi-Fi.
export const isTailnetAddress = (host) => {
  const p = parts(host);
  return Boolean(p) && p[0] === 100 && p[1] >= 64 && p[1] <= 127;
};

export function addressKind(host) {
  const p = parts(host);
  if (!p) return /\.local$/i.test(String(host)) ? "name" : "other";
  if (isTailnetAddress(host)) return "tailscale";
  if (p[0] === 127) return "this phone";
  if (p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)) return "wifi";
  return "other";
}

// Is this somewhere on the office network (or Tailscale)? Used for pairing and for the addresses the PC reports to a
// phone: the app never follows an address outside these ranges, however it arrived. The URL parser re-reads it so
// nothing in it (an "@", a port like "1@evil.com") can point a request anywhere else.
const PRIVATE_IP = /^(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01])|169\.254|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}$/;
const LOCAL_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.local$/i;
export const isOfficeAddress = (host, port = 8443) => {
  const h = String(host || "").trim();
  if (!PRIVATE_IP.test(h) && !LOCAL_NAME.test(h)) return false;
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) return false;
  try {
    const url = new URL(`https://${h}:${Number(port)}/`);
    return url.hostname === h.toLowerCase() && url.port === String(Number(port)) && !url.username;
  } catch {
    return false;
  }
};

const MAX_ADDRESSES = 8;

// What the PC says its addresses are -> the ones this phone may keep.
export function acceptableAddresses(offered, port) {
  if (!Array.isArray(offered)) return [];
  const out = [];
  for (const item of offered) {
    const host = typeof item === "string" ? item.trim() : "";
    if (host && isOfficeAddress(host, port) && !out.some((h) => h.toLowerCase() === host.toLowerCase())) out.push(host);
    if (out.length >= MAX_ADDRESSES) break;
  }
  return out;
}

const TAILSCALE_DOWNLOAD = "https://tailscale.com/download/windows";

// The PC's Tailscale status (devices.py lan_status "tailscale") as a sentence and, if needed, where to get it.
export function tailscaleAdvice(status) {
  if (status?.address) return { level: "good", text: "Tailscale is on: phones can also connect from anywhere, not just the office Wi-Fi." };
  if (status?.installed) return { level: "todo", text: "Tailscale is installed on this PC but not connected. Open it and sign in (use the same account as on the phones); this page then shows it here." };
  return {
    level: "todo",
    text: "Install Tailscale (free) on this PC and sign in with the same account as on the phones. Then phones connect from anywhere, even when the office Wi-Fi will not let them reach this PC - and they pick up the new address by themselves, no pairing again.",
    link: TAILSCALE_DOWNLOAD,
  };
}
