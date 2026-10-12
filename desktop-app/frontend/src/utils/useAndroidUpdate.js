import { useCallback, useEffect, useRef, useState } from "react";
import { CHECKED_KEY, RELEASE_API, checkForAndroidUpdate } from "./androidUpdate";
import { appInfo, downloadUpdate, installUpdate, onDownloadProgress } from "./androidUpdateNative";

const TEST_API_KEY = "sandveld_update_test_api"; // honoured only by a debug build (a local test server), never a release

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable: just asks again sooner */ } };

/** The phone's update steps: check GitHub, download, hand to Android's installer. One instance per screen using it. */
export function useAndroidUpdate() {
  const [state, setState] = useState({ phase: "idle", current: null, update: null, percent: 0, message: "" });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const set = useCallback((patch) => { if (alive.current) setState((s) => ({ ...s, ...patch })); }, []);

  const check = useCallback(async () => {
    set({ phase: "checking", message: "" });
    try {
      const info = await appInfo();
      const testApi = info.debuggable ? read(TEST_API_KEY) : null;
      const result = await checkForAndroidUpdate(info.versionName, globalThis.fetch.bind(globalThis), testApi || RELEASE_API, Boolean(testApi));
      if (result.state !== "error") write(CHECKED_KEY, String(Date.now()));
      set({ current: info.versionName, update: result.update || null, phase: result.state, message: result.message || "" });
      return result;
    } catch (error) {
      set({ phase: "error", message: "Couldn't check for an update." });
      return { state: "error" };
    }
  }, [set]);

  const install = useCallback(async () => {
    try {
      const result = await installUpdate();
      set(result.needsPermission ? { phase: "needs-permission" } : { phase: "installing" });
    } catch (error) {
      set({ phase: "error", message: error?.message || "Could not start the installer." });
    }
  }, [set]);

  const start = useCallback(async (update) => {
    set({ phase: "downloading", percent: 0, message: "" });
    let handle;
    try {
      handle = await onDownloadProgress(({ received, total }) => set({ percent: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0 }));
      await downloadUpdate(update);
    } catch (error) {
      set({ phase: "error", message: error?.message || "The update could not be downloaded." });
      return;
    } finally {
      handle?.remove?.();
    }
    set({ percent: 100 });
    await install();
  }, [set, install]);

  return { ...state, check, start, install };
}
