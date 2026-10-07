import { DEFAULT_AUTO_LOCK_MINUTES, parseAutoLockMinutes } from "./idleLock";

const KEY = "sandveld_auto_lock_minutes";
const CHANGED = "sandveld-auto-lock-changed";

export function getAutoLockMinutes() {
  try {
    return parseAutoLockMinutes(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
}

export function setAutoLockMinutes(minutes) {
  try {
    localStorage.setItem(KEY, String(minutes));
  } catch {
    // Storage unavailable - applies until the app is closed.
  }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: minutes }));
}

// Calls back with the new value whenever the setting changes (this window or another).
export function onAutoLockChanged(callback) {
  const fromStorage = (e) => { if (e.key === KEY) callback(getAutoLockMinutes()); };
  const fromHere = () => callback(getAutoLockMinutes());
  window.addEventListener("storage", fromStorage);
  window.addEventListener(CHANGED, fromHere);
  return () => {
    window.removeEventListener("storage", fromStorage);
    window.removeEventListener(CHANGED, fromHere);
  };
}
