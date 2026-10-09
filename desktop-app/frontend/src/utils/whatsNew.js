// "What's new": after an update the app shows, once, what changed (components/WhatsNew.jsx). Which version is
// running comes from the build (vite.config.js reads version.json); which one this computer or phone last showed
// is kept in localStorage. The words themselves are in whatsNew/notes.js.
const SEEN_KEY = "sandveld_whats_new_seen";
const RETURNING_KEY = "sandveld_remembered_user"; // written when someone signs in: its presence means "has been used before"

export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** The notes to show now, newest first: every version after `lastSeen` up to the running one. A device that never
 * showed notes but has been used before (updated from a version without this feature) gets the running version's
 * notes once; a brand-new install gets none - nothing "changed" for it. */
export function notesToShow(notes, lastSeen, current, returning) {
  const upTo = notes.filter((n) => compareVersions(n.version, current) <= 0);
  const sorted = [...upTo].sort((x, y) => compareVersions(y.version, x.version));
  if (lastSeen) return sorted.filter((n) => compareVersions(n.version, lastSeen) > 0);
  if (!returning) return [];
  return sorted.filter((n) => compareVersions(n.version, current) === 0);
}

const storage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function readSeen(store = storage()) {
  try {
    return store?.getItem(SEEN_KEY) || null;
  } catch {
    return null;
  }
}

export function markSeen(version, store = storage()) {
  try {
    store?.setItem(SEEN_KEY, version);
  } catch {
    // Storage unavailable: the notes may show again next launch, which is harmless.
  }
}

/** Was this device used before this launch? Decided once, at start, because signing in writes the key. */
export const startedAsReturningDevice = (() => {
  try {
    return Boolean(storage()?.getItem(RETURNING_KEY));
  } catch {
    return false;
  }
})();

/** The version this build was made as (vite.config.js defines it from version.json). */
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0"; // eslint-disable-line no-undef
