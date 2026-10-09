// The colours a herding program or a step name can be given. Keep in step with
// COLORS in app/core/herding.py (the server only accepts these) and the
// .name-color-* rules in index.css (which pick a shade per theme).
export const NAME_COLORS = [
  { key: "emerald", label: "Green", swatch: "#00d26a" },
  { key: "sky", label: "Light blue", swatch: "#18b4ff" },
  { key: "blue", label: "Blue", swatch: "#2f6bff" },
  { key: "violet", label: "Purple", swatch: "#9b51ff" },
  { key: "pink", label: "Pink", swatch: "#ff2d9a" },
  { key: "rose", label: "Red", swatch: "#ff2d55" },
  { key: "orange", label: "Orange", swatch: "#ff7a00" },
  { key: "amber", label: "Yellow", swatch: "#ffc400" },
  { key: "teal", label: "Teal", swatch: "#00d4c0" },
];

const KNOWN = new Set(NAME_COLORS.map((c) => c.key));

// The class that colours a name; nothing for "no colour" or anything unknown.
export const nameColorClass = (key) => (KNOWN.has(key) ? `name-color-${key}` : "");
