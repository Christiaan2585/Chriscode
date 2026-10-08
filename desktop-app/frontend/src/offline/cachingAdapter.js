// A saved copy of what the office PC last said, so the phone still has something to show when it
// cannot reach the PC. Wraps the axios adapter: every successful answer to a read is kept; when
// a read gets no answer at all (no Wi-Fi, PC asleep) the kept copy is used instead. Changes are
// never answered from here, and an answer the PC really gave (even a refusal) is never replaced.
import axios, { AxiosError } from "axios";

// Never kept: sign-in and account calls, backups, the activity log, phone pairing.
const NEVER = ["/auth", "/backups", "/audit", "/devices", "/exports", "/version", "/local-check", "/lan"];

export const cacheKey = (config) => {
  const uri = axios.getUri(config);
  const url = new URL(uri, "https://x.invalid");
  return url.pathname + url.search;
};

export const isCacheable = (config) => {
  if (String(config.method || "get").toLowerCase() !== "get") return false;
  if (config.responseType === "blob" || config.responseType === "arraybuffer") return false;
  const path = new URL(String(config.url || "/"), "https://x.invalid").pathname;
  return !NEVER.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
};

const noAnswer = (error) => Boolean(error) && !error.response && error.code !== "ERR_CANCELED";

/** `store`: {get(key), put(key, entry)}; `onReachable(true|false)` hears whether the PC answered. */
export function withOfflineCache(inner, { store, onReachable = () => {}, preferSaved = () => false }) {
  return async function cachingAdapter(config) {
    const keep = isCacheable(config);
    // Already known to be out of reach: answer from the saved copy at once instead of waiting for another failed attempt.
    if (keep && preferSaved()) {
      let entry;
      try {
        entry = await store.get(cacheKey(config));
      } catch {
        entry = undefined;
      }
      if (entry) {
        return { data: entry.data, status: 200, statusText: "", headers: { "content-type": entry.type || "application/json", "x-from-saved-copy": "1" }, config, request: {} };
      }
    }
    // Known to be out of reach and nothing saved to answer with: fail at once (so a change is queued straight away
    // instead of after a long wait). Only the quick "is it there?" probes (`fast`) still try the PC.
    if (preferSaved() && !config.fast) throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, {});
    let response;
    try {
      response = await inner(config);
    } catch (error) {
      if (!noAnswer(error)) {
        if (error?.response) onReachable(true);
        throw error;
      }
      onReachable(false);
      if (keep) {
        let entry;
        try {
          entry = await store.get(cacheKey(config));
        } catch {
          entry = undefined;
        }
        if (entry) {
          return { data: entry.data, status: 200, statusText: "", headers: { "content-type": entry.type || "application/json", "x-from-saved-copy": "1" }, config, request: {} };
        }
      }
      throw error;
    }
    onReachable(true);
    if (keep && response.status >= 200 && response.status < 300 && typeof response.data === "string") {
      try {
        await store.put(cacheKey(config), { data: response.data, type: response.headers?.["content-type"], savedAt: Date.now() });
      } catch {
        // storage full or unavailable - the request itself still worked
      }
    }
    return response;
  };
}
