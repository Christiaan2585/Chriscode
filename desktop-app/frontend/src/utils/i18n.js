// The app's language: English (default) or Afrikaans, chosen per computer / phone in Settings -> General -> Appearance.
// Text is looked up by its English wording in translations.af.js; anything not translated yet simply stays English.
// The language is fixed for a session: changing it reloads the app (simple, and nothing shows half and half).
import { readStored, writeStored } from "./stored.js";
import { AF } from "./translations.af.js";

export const LANGUAGES = [{ id: "en", label: "English" }, { id: "af", label: "Afrikaans" }];

const KEY = "sandveld_ui_language";
export const cleanLanguage = (id) => (id === "af" ? "af" : "en");
export const getLanguage = () => cleanLanguage(readStored(KEY, "en"));

export function setLanguage(id) {
  writeStored(KEY, cleanLanguage(id));
  if (typeof window !== "undefined" && window.location?.reload) window.location.reload();
}

// translate("Showing {shown} of {total}", "af", { shown: 1, total: 5 }) -> "Wys 1 van 5"
export function translate(text, lang, vars) {
  let out = lang === "af" && Object.prototype.hasOwnProperty.call(AF, text) ? AF[text] : text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(String(value));
  return out;
}

const current = getLanguage();
export const currentLanguage = current;
/** The date/number locale to pass to toLocaleDateString: the browser's own for English, South African Afrikaans for Afrikaans. */
export const dateLocale = current === "af" ? "af-ZA" : undefined;

/** The text in the app's language, with {placeholders} filled in. */
export const t = (text, vars) => translate(text, current, vars);
