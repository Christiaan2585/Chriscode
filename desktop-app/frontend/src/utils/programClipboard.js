import { useMemo, useSyncExternalStore } from "react";

// "Copy program" / "Paste program": the program last copied, kept for this
// window's session so it can be pasted into any client's page.
const KEY = "sandveld_copied_program";
const CHANGED = "sandveld-copied-program";

const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const copyProgram = (program, clientName) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id: program.id, name: program.name, clientName: clientName || "" }));
  } catch {
    /* sessionStorage unavailable: copying just won't stick */
  }
  window.dispatchEvent(new Event(CHANGED));
};

export const clearCopiedProgram = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.dispatchEvent(new Event(CHANGED));
};

const subscribe = (notify) => {
  window.addEventListener(CHANGED, notify);
  return () => window.removeEventListener(CHANGED, notify);
};

// {id, name, clientName} of the copied program, or null.
export const useCopiedProgram = () => {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [raw]);
};
