// Per-computer preferences kept in localStorage. The keys live here so the page
// that uses a preference and the Settings department that edits it can't drift.
export const PREF_KEYS = {
  productsView: "sandveld_products_view", // "catalog" | "table"
  calendarPlanDate: "sandveld_calendar_plan_mating_date", // "YYYY-MM-DD"
  weatherLocation: "sandveld_weather_location", // {lat, lon, label, source}
  weatherAsked: "sandveld_weather_permission_asked",
};

export function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable - applies for this session only.
  }
}
