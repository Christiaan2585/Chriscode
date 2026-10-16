// How recent the newest backup is, in words (Settings, and the Settings badge when it has been too long).
// `backups` is GET /backups/'s list (admins only); created_at is the PC's local time.
export const STALE_AFTER_DAYS = 3;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function backupStatus(backups, now = new Date()) {
  if (!Array.isArray(backups)) return { state: "unknown", text: "", days: null };
  if (!backups.length) return { state: "none", text: "No backup yet", days: null };
  const newest = new Date(Math.max(...backups.map((b) => new Date(b.created_at).getTime())));
  const days = Math.round((startOfDay(now) - startOfDay(newest)) / 86400000);
  if (days > STALE_AFTER_DAYS) return { state: "stale", text: `No backup for ${days} days`, days };
  const when = days <= 0 ? `today ${hhmm(newest)}` : days === 1 ? `yesterday ${hhmm(newest)}` : `${days} days ago`;
  return { state: "fresh", text: `Last backup: ${when}`, days };
}
