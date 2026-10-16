import { useEffect } from "react";
import { saveDraft } from "./stored";

// Keeps a NEW form (invoice, quote) safe while it is being filled in: saved on this device a moment after each change,
// so an auto-lock, a closed window or a crash does not lose it. `meaningful` = the form has something in it.
// Restoring and clearing use loadDraft / clearDraft (utils/stored.js).
export function useAutosaveDraft(name, active, value, meaningful) {
  const snapshot = JSON.stringify(value);
  useEffect(() => {
    if (!active || !meaningful) return undefined;
    const timer = setTimeout(() => saveDraft(name, JSON.parse(snapshot)), 400);
    return () => clearTimeout(timer);
  }, [name, active, meaningful, snapshot]);
}
