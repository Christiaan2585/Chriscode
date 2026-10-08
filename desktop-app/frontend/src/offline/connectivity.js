// Whether the office PC is answering right now. The caching adapter reports every answer / no-answer
// here; while the PC is silent a light probe keeps asking, and everything that has been waiting
// (queued changes, signing back in, refreshing the data) starts the moment it answers again.
import { useSyncExternalStore } from "react";

let reachable = true; // optimistic until a request says otherwise
const listeners = new Set();
const comeBack = new Set();

export const isReachable = () => reachable;

export function setReachable(value) {
  if (value === reachable) return;
  reachable = value;
  listeners.forEach((fn) => fn());
  if (value) comeBack.forEach((fn) => fn());
}

export const subscribeReachable = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Tells the waiting jobs to start: used when the phone has signed in again after an offline unlock. */
export const notifySessionResumed = () => comeBack.forEach((fn) => fn());

/** Runs `fn` each time the PC answers again after having been out of reach. */
export const onBackOnline = (fn) => {
  comeBack.add(fn);
  return () => comeBack.delete(fn);
};

export const useReachable = () => useSyncExternalStore(subscribeReachable, isReachable, () => true);

const QUIET_MS = 15000;
const NORMAL_MS = 60000;

/** `probe()` makes one cheap request; its answer (or silence) reaches setReachable through the adapter. */
export function startReachabilityWatch(probe) {
  let stopped = false;
  let timer = null;
  const tick = async () => {
    try {
      await probe();
    } catch {
      // silence is reported by the adapter
    }
    if (!stopped) timer = setTimeout(tick, reachable ? NORMAL_MS : QUIET_MS);
  };
  const soon = () => {
    clearTimeout(timer);
    tick();
  };
  window.addEventListener("online", soon);
  const visible = () => document.visibilityState === "visible" && soon();
  document.addEventListener("visibilitychange", visible);
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("online", soon);
    document.removeEventListener("visibilitychange", visible);
  };
}
