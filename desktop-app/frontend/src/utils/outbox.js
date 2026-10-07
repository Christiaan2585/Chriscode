// The offline outbox (Android, Phase 4): when a phone can't reach the
// office PC, a handful of write actions are queued here instead of being
// lost, then replayed in order once the PC is reachable again. Only
// actions that are safe to defer are queued - anything that needs a
// number or an up-to-date read from the PC (editing an existing invoice,
// deleting a client, etc.) still just fails immediately offline, exactly
// as it always has.
//
// Two job shapes:
// - "request": one HTTP call, replayed as-is (e.g. ticking a herding step).
// - "quote-create": POST /quotes/ then POST the items, so the quote's
//   number is only ever assigned by the PC when the job actually runs.
import apiClient from "../api/client";

const KEY = "sandveld_outbox_v1";
const listeners = new Set();

const readQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};

const writeQueue = (queue) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // storage full or unavailable - the queue just won't survive a restart.
  }
  listeners.forEach((fn) => fn(queue));
};

export const subscribeOutbox = (fn) => {
  listeners.add(fn);
  fn(readQueue());
  return () => listeners.delete(fn);
};

export const outboxLength = () => readQueue().length;

const push = (job) => {
  const queue = readQueue();
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: Date.now(), ...job });
  writeQueue(queue);
};

export const queueRequest = (method, url, data) => push({ kind: "request", method, url, data });
export const queueQuoteCreate = (quote, items) => push({ kind: "quote-create", quote, items });

// axios gives a response for any real reply from the PC, even a 4xx/5xx -
// those are genuine rejections and must surface as errors. No response at
// all means the request never reached the PC (phone off the office Wi-Fi),
// which is the only case worth queuing and retrying later.
export const isOffline = (error) => Boolean(error) && !error.response;

// A queued job must also survive the phone's JWT going away (access tokens
// are memory-only, so an app restart while offline signs the user out) -
// retry on 401 too rather than dropping someone's work because they
// weren't signed back in yet the moment connectivity returned.
const isRetryable = (error) => isOffline(error) || error.response?.status === 401;

// Marked queueable too: a background retry that's still offline, or not
// signed in yet, shouldn't spam the same "could not reach backend" toast
// every 30 seconds - see api/client.js.
const QUEUEABLE = { queueable: true };

const runJob = async (job) => {
  if (job.kind === "quote-create") {
    const savedQuote = (await apiClient.post("/quotes/", job.quote, QUEUEABLE)).data;
    for (const item of job.items) {
      await apiClient.post(`/quotes/${savedQuote.id}/items`, item, QUEUEABLE);
    }
    return;
  }
  await apiClient.request({ method: job.method, url: job.url, data: job.data, ...QUEUEABLE });
};

let flushing = false;

export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    for (let queue = readQueue(); queue.length; queue = readQueue()) {
      try {
        await runJob(queue[0]);
      } catch (error) {
        if (isRetryable(error)) return; // still unreachable, or not signed in yet - stop, the next trigger retries from here
        // A real rejection (expired session, a product since deleted, ...) -
        // drop it rather than retry forever on something that will never work.
      }
      writeQueue(queue.slice(1));
    }
  } finally {
    flushing = false;
  }
}

export function startOutboxAutoFlush() {
  const tryFlush = () => flushOutbox();
  window.addEventListener("online", tryFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryFlush();
  });
  const interval = setInterval(tryFlush, 30000);
  tryFlush();
  return () => {
    window.removeEventListener("online", tryFlush);
    clearInterval(interval);
  };
}
