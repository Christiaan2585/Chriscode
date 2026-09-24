// Dark is the default look; the choice is remembered per computer.
const KEY = "sandveld_theme";

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage unavailable - the theme still applies for this session.
  }
}
