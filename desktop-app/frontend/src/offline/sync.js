// Keeps the phone's saved copy of the office data up to date: a full download the first time
// (right after pairing and signing in), a quick refresh of the lists every few minutes, and
// everything again when the PC comes back after being out of reach.
import { useSyncExternalStore } from "react";
import apiClient, { isHoldingUnauthorized } from "../api/client";
import { flushOutbox } from "../utils/outbox";
import { onBackOnline, isReachable } from "./connectivity";
import { meta, savedCopy } from "./store";
import { downloadEverything } from "./syncPlan";

const state = { running: false, done: 0, total: 0, lastSyncedAt: null, lastFullAt: null, saved: 0, deep: false };
let snapshot = { ...state };
const listeners = new Set();
const emit = () => {
  snapshot = { ...state };
  listeners.forEach((fn) => fn());
};

export const getSyncState = () => snapshot;
export const subscribeSync = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useSyncState = () => useSyncExternalStore(subscribeSync, getSyncState, getSyncState);

const QUICK_EVERY_MS = 10 * 60 * 1000;
let controller = null;

const get = async (url, params) => (await apiClient.get(url, { params, silent: true, queueable: true })).data;

async function loadMeta() {
  try {
    state.lastSyncedAt = (await meta.get("lastSyncedAt")) || null;
    state.lastFullAt = (await meta.get("lastFullAt")) || null;
    state.saved = (await savedCopy.count()) || 0;
  } catch {
    // storage unavailable - sync still works, it just is not remembered
  }
  emit();
}

/** `deep` also fetches every client's own pages (slower; the first time and after being offline). */
export async function syncNow({ deep = false, queryClient } = {}) {
  if (state.running || !isReachable()) return null;
  state.running = true;
  state.deep = deep;
  state.done = 0;
  state.total = 0;
  controller = new AbortController();
  emit();
  let result = null;
  try {
    result = await downloadEverything({
      get, deep, signal: controller.signal, concurrency: 4,
      onProgress: ({ done, total }) => {
        state.done = done;
        state.total = total;
        emit();
        if (!isReachable()) controller?.abort(); // the PC went quiet: stop asking, the saved copy stays as it was
      },
    });
    if (!result.aborted && result.failed < result.total) {
      state.lastSyncedAt = Date.now();
      if (deep) state.lastFullAt = state.lastSyncedAt;
      try {
        await meta.set("lastSyncedAt", state.lastSyncedAt);
        if (deep) await meta.set("lastFullAt", state.lastFullAt);
        state.saved = (await savedCopy.count()) || 0;
      } catch {
        // see loadMeta
      }
      queryClient?.invalidateQueries(); // the screens now showing refresh from what was just fetched
    }
  } finally {
    state.running = false;
    controller = null;
    emit();
  }
  return result;
}

export const stopSync = () => controller?.abort();

export async function forgetSyncState() {
  stopSync();
  state.lastSyncedAt = null;
  state.lastFullAt = null;
  state.saved = 0;
  emit();
}

/** Called once a person is signed in: first download, regular quick refreshes, and a full one when the PC is back. */
export function startOfflineSupport(queryClient) {
  loadMeta().then(() => {
    if (!isReachable()) return;
    const stale = !state.lastFullAt;
    syncNow({ deep: stale, queryClient });
  });
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") syncNow({ deep: false, queryClient });
  }, QUICK_EVERY_MS);
  const stopBack = onBackOnline(async () => {
    if (isHoldingUnauthorized()) return; // still unlocked offline: the quiet sign-in announces itself when done
    await flushOutbox();
    queryClient.invalidateQueries();
    syncNow({ deep: true, queryClient });
  });
  return () => {
    clearInterval(interval);
    stopBack();
    stopSync();
  };
}
