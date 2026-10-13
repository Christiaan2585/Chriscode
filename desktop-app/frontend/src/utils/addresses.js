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
