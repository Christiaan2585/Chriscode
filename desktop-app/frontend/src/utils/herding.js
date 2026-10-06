// Shared bits for the master herding program (pages/Programs.jsx) and a
// client's own copy of it (components/HerdingProgramPanel.jsx). Dates, amounts and costs
// are worked out server-side (app/core/herding.py) - nothing is recomputed here.

export const ANCHOR_LABELS = {
  mating_start: "the first mating day",
  mating_end: "the end of mating",
  lambing_start: "lambing starts",
  lambing_end: "lambing ends",
  weaning: "weaning day",
};
export const UNDATED = "none"; // a step with no date - the medicine box

// The five headcounts every program has, as on the business's cost sheet
// (app/core/herding.py GROUPS). A product line is for one or more of them.
export const GROUPS = ["Ooie", "Ramme", "Lammers", "Jong ooitjies", "Jong rammetjies"];
export const splitGroups = (text) =>
  String(text || "").split(/[,+&]/).map((s) => s.trim()).filter(Boolean);

export const TEXT_COLUMNS = [
  ["management", "Herd management"],
  ["vaccinations", "Vaccinations"],
  ["dosing", "Dosing"],
  ["vitamins", "Vitamins & trace elements"],
  ["feeding", "Feeding"],
];

const span = (days) => {
  const n = Math.abs(days);
  if (n % 7 === 0) return `${n / 7} week${n === 7 ? "" : "s"}`;
  return `${n} day${n === 1 ? "" : "s"}`;
};

// "6 weeks before the first mating day", "On weaning day", "3 days after lambing ends"
export const ruleText = (anchor, offset) => {
  if (anchor === UNDATED) return "No date - keep on hand";
  return offset === 0
    ? `On ${ANCHOR_LABELS[anchor]}`
    : `${span(offset)} ${offset < 0 ? "before" : "after"} ${ANCHOR_LABELS[anchor]}`;
};

// API dates are "YYYY-MM-DD" - read them as local days, not UTC midnight.
export const parseDay = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day);
};
export const dayLabel = (d, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  d ? parseDay(d).toLocaleDateString(undefined, opts) : "—";
export const toInputDate = (d) => (d ? String(d).slice(0, 10) : "");
export const isMonday = (d) => Boolean(d) && parseDay(d).getDay() === 1;

export const STEP_STATUS = {
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-700" },
  due: { label: "This week", className: "bg-amber-100 text-amber-700" },
  upcoming: { label: "Coming up", className: "bg-slate-100 text-slate-600" },
  none: { label: "Any time", className: "bg-slate-100 text-slate-500" },
};

export const amount = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
