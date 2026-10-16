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

// ISO week ("2026-W42"): Monday starts a new week; early January can belong to the old year's last week.
export function weekKey(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const rand = (n) => `R ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;

// "Your week at a glance": once a week (the first time the app is open in a new ISO week), what is overdue, what is
// waiting for an answer and how many program dates are due. null when it was shown this week or the week is quiet.
export function weeklySummary(board, now, lastWeek) {
  const week = weekKey(now);
  if (lastWeek === week || !board) return null;
  const overdue = board.money?.past_due_count || 0;
  const waiting = board.quotes_waiting?.count || 0;
  const dates = (board.attention || []).filter((a) => (a.type === "treatment" || a.type === "scan") && (a.severity === "overdue" || a.severity === "soon")).length;
  const parts = [
    overdue && `${plural(overdue, "invoice", "invoices")} overdue (${rand(board.money.past_due_total)})`,
    waiting && `${plural(waiting, "quote", "quotes")} waiting for an answer`,
    dates && `${plural(dates, "program date", "program dates")} due or overdue`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return { week, title: "Your week at a glance", body: parts.join(", ") };
}

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* applies until the app closes */ } };

export const remindersOn = () => read(KEY_ON) !== "0";
export const setRemindersOn = (on) => write(KEY_ON, on ? "1" : "0");
export const lastReminderDay = () => read(KEY_LAST);
export const markReminded = (day) => write(KEY_LAST, day);
export const lastSummaryWeek = () => read("sandveld_summary_week");
export const markSummaryShown = (week) => write("sandveld_summary_week", week);
