// The colours a herding program or a step name can be given. Keep in step with
// COLORS in app/core/herding.py (the server only accepts these) and the
// .name-color-* rules in index.css (which pick a shade per theme).
export const NAME_COLORS = [
  { key: "emerald", label: "Green", swatch: "#10b981" },
  { key: "sky", label: "Light blue", swatch: "#0ea5e9" },
  { key: "blue", label: "Blue", swatch: "#3b82f6" },
  { key: "violet", label: "Purple", swatch: "#8b5cf6" },
  { key: "pink", label: "Pink", swatch: "#ec4899" },
  { key: "rose", label: "Red", swatch: "#f43f5e" },
  { key: "orange", label: "Orange", swatch: "#f97316" },
  { key: "amber", label: "Yellow", swatch: "#f59e0b" },
  { key: "teal", label: "Teal", swatch: "#14b8a6" },
];

const KNOWN = new Set(NAME_COLORS.map((c) => c.key));

// The class that colours a name; nothing for "no colour" or anything unknown.
export const nameColorClass = (key) => (KNOWN.has(key) ? `name-color-${key}` : "");
