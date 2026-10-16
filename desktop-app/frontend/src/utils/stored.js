// Small things the app remembers on this computer or phone (search boxes, recent picks, unfinished forms).
// Pure and safe: private windows and blocked storage just mean nothing is remembered. Tested in stored.test.mjs.

const safeStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function readStored(key, fallback, storage = safeStorage()) {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStored(key, value, storage = safeStorage()) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* nothing is remembered - fine */ }
}

// The values someone picked last, newest first (for "Recent" at the top of a picker).
export function pushRecent(list, value, max = 5) {
  const v = String(value ?? "");
  if (!v) return list;
  return [v, ...list.filter((x) => String(x) !== v)].slice(0, max);
}

// An unfinished form: kept for a week, then forgotten.
const DRAFT_MAX_AGE_MS = 7 * 86400000;
const draftKey = (name) => `sandveld_draft_${name}`;

export function saveDraft(name, value, storage = safeStorage(), now = Date.now()) {
  writeStored(draftKey(name), { at: now, value }, storage);
}

export function loadDraft(name, storage = safeStorage(), now = Date.now()) {
  const entry = readStored(draftKey(name), null, storage);
  if (!entry || typeof entry.at !== "number" || now - entry.at > DRAFT_MAX_AGE_MS) return null;
  return entry.value ?? null;
}

export function clearDraft(name, storage = safeStorage()) {
  try { storage?.removeItem(draftKey(name)); } catch { /* ignore */ }
}
