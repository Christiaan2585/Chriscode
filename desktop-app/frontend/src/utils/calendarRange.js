const pad = (n) => String(n).padStart(2, "0");

// Local-date key (YYYY-MM-DD). Appointment dates arrive as naive ISO
// strings, so their first 10 characters are already in this form -
// comparing strings avoids any timezone shift from Date parsing.
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Weeks (Monday first) covering the given month, padded with the days of
// the neighbouring months so every row is a full week.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil(((first.getDay() + 6) % 7 + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

// The start and end the Calendar page asks the PC for when showing a month.
export function monthRange(year, month) {
  const days = monthGrid(year, month);
  return { start: dayKey(days[0]), end: dayKey(days[days.length - 1]) };
}
