// Colour schemes: the app is built from Tailwind's emerald (accent) and slate (neutral) colours, which are
// CSS variables, so a scheme is just a different set of values for those variables - set on the page by
// theme.js. Every scheme, green included, has a light and a dark version, built to be easy on the eyes: the light
// look uses a soft off-white for cards and a gently tinted page instead of glaring pure white, and the dark look
// uses softened text and accent colours rather than near-white and neon. Tests (colorSchemes.test.mjs) hold every
// scheme to readable contrast at both ends: strong enough to read, not so strong it glares.

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
const LIGHT_NEUTRAL = [96.5, 93.5, 88.5, 80, 62, 41, 31, 23, 15, 10];
const DARK_NEUTRAL = [17, 21, 25, 31, 62, 71, 78, 85, 91, 95];
const ramp = (hue, sat, lightness) => Object.fromEntries(STEPS.map((step, i) => [step, hslToHex(hue, sat, lightness[i])]));

// Mix `a` towards `b` (t = 0..1): used to take the glare out of the bright dark-look accent colours.
const mix = (a, b, t) => `#${hexToRgb(a).map((v, i) => Math.round(v + (hexToRgb(b)[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;

// hue/sat tint the greys; `dark` describes the dark look: the surfaces' hue and the lifted accent text.
export const SCHEMES = [
  {
    id: "green", name: "Green Pastures", blurb: "Calm lucerne green - the original look, made gentler.",
    accent: { 50: "#eef7f2", 100: "#d8eee2", 200: "#b3dcc6", 300: "#82c4a3", 400: "#4fa883", 500: "#2f8c68", 600: "#1f7556", 700: "#195e46", 800: "#164a38", 900: "#123d2f" },
    rgb: "47 140 104", hue: 150, sat: 6, darkHue: 160, accentText: "#7fcaa6", accentTextHi: "#a8dcc2",
  },
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
  const scheme = byId(id) || byId(DEFAULT_SCHEME);
  const vars = { "--acc-rgb": scheme.rgb };
  for (const step of STEPS) vars[`--color-emerald-${step}`] = scheme.accent[step];
  if (mode === "dark") {
    const neutral = ramp(scheme.darkHue, 22, DARK_NEUTRAL);
    for (const step of STEPS) vars[`--color-slate-${step}`] = neutral[step];
    // In the dark look the pale accent steps are translucent washes (made by the stylesheet from --acc-rgb).
    delete vars["--color-emerald-50"];
    delete vars["--color-emerald-100"];
    Object.assign(vars, {
      "--acc-text": mix(scheme.accentText, hslToHex(scheme.darkHue, 14, 80), 0.14),
      "--acc-text-hi": mix(scheme.accentTextHi, hslToHex(scheme.darkHue, 14, 80), 0.14),
      "--dk-bg": hslToHex(scheme.darkHue, 28, 9.5),
      "--dk-sidebar": hslToHex(scheme.darkHue, 24, 11.5),
      "--dk-card": hslToHex(scheme.darkHue, 24, 15.5),
      "--dk-line": hslToHex(scheme.darkHue, 18, 22),
      "--dk-text": hslToHex(scheme.darkHue, 14, 85),
    });
  } else {
    const neutral = ramp(scheme.hue, scheme.sat, LIGHT_NEUTRAL);
    for (const step of STEPS) vars[`--color-slate-${step}`] = neutral[step];
    // Cards, panels and pop-ups are Tailwind's "white": a soft off-white keeps them from glaring (text-white follows).
    vars["--color-white"] = hslToHex(scheme.hue, Math.min(scheme.sat + 4, 16), 99);
  }
  return vars;
}

/** The handful of colours a scheme's preview tile is drawn with, for the light or dark look. */
export function previewColors(id, mode) {
  const scheme = byId(id) || SCHEMES[0];
  const v = schemeVariables(scheme.id, mode);
  return mode === "dark"
    ? { page: v["--dk-bg"], sidebar: v["--dk-sidebar"], card: v["--dk-card"], line: v["--dk-line"], text: v["--dk-text"], muted: v["--color-slate-500"], accent: v["--color-emerald-600"], accentText: v["--acc-text"] }
    : { page: v["--color-slate-50"], sidebar: v["--color-emerald-900"], card: v["--color-white"], line: v["--color-slate-200"], text: v["--color-slate-800"], muted: v["--color-slate-500"], accent: v["--color-emerald-600"], accentText: v["--color-emerald-700"] };
}
