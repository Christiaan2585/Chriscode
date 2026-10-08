// The look: dark or light, and which colour scheme (see colorSchemes.js). Dark and the original green scheme
// are the defaults; the choices are remembered per computer / phone.
import { DEFAULT_SCHEME, isScheme, schemeVariables } from "./colorSchemes.js";

const MODE_KEY = "sandveld_theme";
const SCHEME_KEY = "sandveld_scheme";
export const CHANGED = "sandveld-appearance"; // fired on the window whenever the look changes, so every control stays in step

// If storage is blocked, the choice still holds for this session.
let memoryMode = null;
let memoryScheme = null;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined; // blocked: the in-session choice (if any) is used instead
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable - the choice still applies for this session.
  }
};

export function getTheme() {
  const saved = read(MODE_KEY);
  return saved === undefined ? memoryMode || "dark" : saved === "light" ? "light" : "dark";
}

export function getScheme() {
  const saved = read(SCHEME_KEY);
  if (saved === undefined) return isScheme(memoryScheme) ? memoryScheme : DEFAULT_SCHEME;
  return isScheme(saved) ? saved : DEFAULT_SCHEME;
}

const appliedNames = new WeakMap(); // which variables each page root currently has from a scheme

/** Puts the saved (or given) mode and scheme on the page: the dark class, the scheme's name and its colours. */
export function applyAppearance(root = document.documentElement) {
  const mode = getTheme();
  const scheme = getScheme();
  root.classList.toggle("theme-dark", mode === "dark");
  root.dataset.scheme = scheme;
  for (const name of appliedNames.get(root) || []) root.style.removeProperty(name);
  const vars = schemeVariables(scheme, mode);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  appliedNames.set(root, Object.keys(vars));
  if (typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new Event(CHANGED));
}

export function setTheme(mode, root) {
  memoryMode = mode === "light" ? "light" : "dark";
  write(MODE_KEY, memoryMode);
  applyAppearance(root);
}

export function setScheme(id, root) {
  memoryScheme = isScheme(id) ? id : DEFAULT_SCHEME;
  write(SCHEME_KEY, memoryScheme);
  applyAppearance(root);
}

// The dark/light toggle and the first paint call this name.
export const applyTheme = (mode) => setTheme(mode);
