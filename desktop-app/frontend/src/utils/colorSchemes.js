// Colour schemes: the app is built from Tailwind's emerald (accent) and slate (neutral) colours, which are
// CSS variables, so a scheme is just a different set of values for those variables - set on the page by
// theme.js. The first scheme is the original look and sets nothing (the stylesheet already is that look).
// Each scheme has a light and a dark version; tests (colorSchemes.test.mjs) check that text stays readable.

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
export const DEFAULT_SCHEME = "green";

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[channel(0), channel(8), channel(4)].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two #rrggbb colours (1 = identical, 21 = black on white). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Greys with a hint of the scheme's own hue, at Tailwind's own lightness steps.
const LIGHT_NEUTRAL = [98, 95.5, 90, 82, 62, 41, 31, 23, 15, 9];
const DARK_NEUTRAL = [17, 21, 25, 31, 64, 73, 80, 88, 94, 97];
const ramp = (hue, sat, lightness) => Object.fromEntries(STEPS.map((step, i) => [step, hslToHex(hue, sat, lightness[i])]));

const GREEN = { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b" };

// hue/sat tint the greys; `dark` describes the dark look: the surfaces' hue and the lifted accent text.
export const SCHEMES = [
  { id: "green", name: "Green Pastures", blurb: "Fresh lucerne green - the original look.", swatch: GREEN },
  {
    id: "wheat", name: "Harvest Wheat", blurb: "Ripe wheat and straw on warm cream, brown at night.",
    accent: { 50: "#fcf7e6", 100: "#f8eec6", 200: "#f0dc92", 300: "#e5c45c", 400: "#d6a932", 500: "#bf8d1c", 600: "#8f5f0d", 700: "#744c0c", 800: "#5c3d0e", 900: "#41300f" },
    rgb: "191 141 28", hue: 40, sat: 12, darkHue: 38, accentText: "#e5c45c", accentTextHi: "#f0dc92",
  },
  {
    id: "barn", name: "Barn Red", blurb: "Rust-red barn doors and brick, on warm stone.",
    accent: { 50: "#fbf1ee", 100: "#f6dfd8", 200: "#ecbcae", 300: "#df9380", 400: "#cf6a52", 500: "#b94a30", 600: "#98371f", 700: "#7d2e1d", 800: "#66271b", 900: "#4a1f19" },
    rgb: "185 74 48", hue: 15, sat: 9, darkHue: 12, accentText: "#e6917c", accentTextHi: "#f2bfb1",
  },
  {
    id: "dam", name: "Dam & Sky", blurb: "Still dam water and a clear morning sky.",
    accent: { 50: "#eef8fb", 100: "#d3edf4", 200: "#a9dbe8", 300: "#74c0d6", 400: "#3ea0be", 500: "#1d82a3", 600: "#146889", 700: "#11546f", 800: "#124759", 900: "#0e3646" },
    rgb: "29 130 163", hue: 205, sat: 18, darkHue: 205, accentText: "#74c0d6", accentTextHi: "#a9dbe8",
  },
  {
    id: "karoo", name: "Karoo Earth", blurb: "Olive scrub, dry sand and kraal stone.",
    accent: { 50: "#f5f7ec", 100: "#e8eed3", 200: "#d2dcab", 300: "#b7c67b", 400: "#98a94f", 500: "#7a8c35", 600: "#5d6d26", 700: "#4b5821", 800: "#3d481f", 900: "#2c3518" },
    rgb: "122 140 53", hue: 70, sat: 8, darkHue: 70, accentText: "#b7c67b", accentTextHi: "#d2dcab",
  },
].map((scheme) => ({ ...scheme, swatch: scheme.swatch || scheme.accent }));

const byId = (id) => SCHEMES.find((s) => s.id === id);
export const isScheme = (id) => Boolean(byId(id));

/** The CSS variables a scheme sets for the light or dark look ({} for the original look). */
export function schemeVariables(id, mode) {
  const scheme = byId(id);
  if (!scheme || scheme.id === DEFAULT_SCHEME) return {};
  const vars = { "--acc-rgb": scheme.rgb };
  for (const step of STEPS) vars[`--color-emerald-${step}`] = scheme.accent[step];
  if (mode === "dark") {
    const neutral = ramp(scheme.darkHue, 22, DARK_NEUTRAL);
    for (const step of STEPS) vars[`--color-slate-${step}`] = neutral[step];
    // In the dark look the pale accent steps are translucent washes (made by the stylesheet from --acc-rgb).
    delete vars["--color-emerald-50"];
    delete vars["--color-emerald-100"];
    Object.assign(vars, {
      "--acc-text": scheme.accentText,
      "--acc-text-hi": scheme.accentTextHi,
      "--dk-bg": hslToHex(scheme.darkHue, 30, 8),
      "--dk-sidebar": hslToHex(scheme.darkHue, 24, 10),
      "--dk-card": hslToHex(scheme.darkHue, 24, 14.5),
      "--dk-line": hslToHex(scheme.darkHue, 18, 21),
      "--dk-text": hslToHex(scheme.darkHue, 14, 90),
    });
  } else {
    const neutral = ramp(scheme.hue, scheme.sat, LIGHT_NEUTRAL);
    for (const step of STEPS) vars[`--color-slate-${step}`] = neutral[step];
  }
  return vars;
}

/** The handful of colours a scheme's preview tile is drawn with, for the light or dark look. */
export function previewColors(id, mode) {
  const scheme = byId(id) || SCHEMES[0];
  if (scheme.id === DEFAULT_SCHEME) {
    return mode === "dark"
      ? { page: "#0e1320", sidebar: "#111827", card: "#171e2e", line: "#262f45", text: "#c5cbda", muted: "#7d879f", accent: "#059669", accentText: "#34d399" }
      : { page: "#f8fafc", sidebar: "#064e3b", card: "#ffffff", line: "#e2e8f0", text: "#1e293b", muted: "#64748b", accent: "#059669", accentText: "#047857" };
  }
  const v = schemeVariables(scheme.id, mode);
  return mode === "dark"
    ? { page: v["--dk-bg"], sidebar: v["--dk-sidebar"], card: v["--dk-card"], line: v["--dk-line"], text: v["--dk-text"], muted: v["--color-slate-500"], accent: v["--color-emerald-600"], accentText: v["--acc-text"] }
    : { page: v["--color-slate-50"], sidebar: v["--color-emerald-900"], card: "#ffffff", line: v["--color-slate-200"], text: v["--color-slate-800"], muted: v["--color-slate-500"], accent: v["--color-emerald-600"], accentText: v["--color-emerald-700"] };
}
