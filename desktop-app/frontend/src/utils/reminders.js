// Windows reminders: once a day, one notification about what is overdue or due this week (the dashboard's
// "needs attention" list). Pure rules here; components/Reminders.jsx shows it.
const KEY_ON = "sandveld_reminders_on";
const KEY_LAST = "sandveld_reminders_last";
const WANTED = new Set(["treatment", "scan", "invoice_overdue"]);
const SHOWN_TITLES = 3;

export function reminderFor(items, today, lastShown) {
  if (lastShown === today) return null;
  const due = (items || []).filter((a) => WANTED.has(a.type) && (a.severity === "overdue" || a.severity === "soon"));
  if (!due.length) return null;
  const names = due.slice(0, SHOWN_TITLES).map((a) => a.title).join(", ");
  const more = due.length > SHOWN_TITLES ? ` and ${due.length - SHOWN_TITLES} more` : "";
  return { count: due.length, title: `${due.length} ${due.length === 1 ? "thing needs" : "things need"} attention`, body: names + more };
}

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* applies until the app closes */ } };

export const remindersOn = () => read(KEY_ON) !== "0";
export const setRemindersOn = (on) => write(KEY_ON, on ? "1" : "0");
export const lastReminderDay = () => read(KEY_LAST);
export const markReminded = (day) => write(KEY_LAST, day);
