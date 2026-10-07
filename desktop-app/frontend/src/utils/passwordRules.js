// A friendly early warning that mirrors the server's password rules
// (app/core/password_policy.py, which is the one that decides). The long list
// of common passwords stays on the server; this only catches the quick ones.
export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblems(password, { email = "", name = "" } = {}) {
  const out = [];
  const pw = password || "";
  if (pw.length < MIN_PASSWORD_LENGTH) out.push(`at least ${MIN_PASSWORD_LENGTH} characters`);
  const codes = [...pw].map((c) => c.charCodeAt(0));
  const steps = new Set(codes.slice(1).map((c, i) => c - codes[i]));
  if (pw && (new Set(pw).size < 4 || (steps.size === 1 && [...steps][0] >= -1 && [...steps][0] <= 1))) out.push("not a repeated or in-a-row pattern");
  const squash = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const own = [squash(email.split("@")[0]), ...name.split(/\s+/).map(squash)].filter((w) => w.length >= 4);
  if (own.some((w) => squash(pw).includes(w))) out.push("not your own name or email");
  return out;
}
