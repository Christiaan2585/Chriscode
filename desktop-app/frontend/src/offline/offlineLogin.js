// Unlocking the app with the PIN while the office PC cannot be reached. Saved after every
// successful online PIN entry; five wrong tries here switch it off until the next online
// sign-in, so a lost phone cannot be guessed at forever offline either. `store` is the
// Keystore-sealed text store ({get, set, remove}).
//
// Two limits keep this from outliving what the office PC has decided:
// - it only works for a while after the phone last checked in with the PC (a person removed or a
//   phone signed out on the PC would otherwise keep opening offline for ever);
// - guesses are counted BEFORE they are checked, one at a time, so firing many at once cannot
//   slip past the five-try limit.
import { checkPin, makeVerifier } from "./pinVerifier.js";

export const MAX_OFFLINE_FAILURES = 5;
export const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const KEY = "offlineLogin";

const read = async (store) => {
  try {
    const raw = await store.get(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const offlineLoginExists = async (store) => Boolean(await read(store));

export async function saveOfflineLogin(store, pin, user, { now = Date.now, ...options } = {}) {
  await store.set(KEY, JSON.stringify({ verifier: await makeVerifier(pin, options), user, failures: 0, verifiedAt: now() }));
}

// The saved user (a new name or photo) without touching the PIN.
export async function updateOfflineUser(store, user) {
  const record = await read(store);
  if (record) await store.set(KEY, JSON.stringify({ ...record, user }));
}

// The phone has just talked to the office PC with a valid sign-in: offline unlock stays good for another week.
export async function touchOfflineLogin(store, { now = Date.now } = {}) {
  const record = await read(store);
  if (record) await store.set(KEY, JSON.stringify({ ...record, verifiedAt: now() }));
}

export const clearOfflineLogin = (store) => store.remove(KEY);

let queue = Promise.resolve(); // one attempt at a time

/** -> {ok: true, user} | {ok: false, left} | {ok: false, disabled: true} | {ok: false, expired: true} */
export function tryOfflineUnlock(store, pin, { now = Date.now } = {}) {
  const attempt = queue.then(() => attemptOnce(store, pin, now));
  queue = attempt.catch(() => {});
  return attempt;
}

async function attemptOnce(store, pin, now) {
  const record = await read(store);
  if (!record) return { ok: false, disabled: true };
  if (now() - (record.verifiedAt || 0) > OFFLINE_MAX_AGE_MS) {
    await store.remove(KEY);
    return { ok: false, expired: true, disabled: true };
  }
  const before = record.failures || 0;
  if (before >= MAX_OFFLINE_FAILURES) {
    await store.remove(KEY);
    return { ok: false, disabled: true, left: 0 };
  }
  // Count this guess first; only a right PIN gives the count back to what it was (it does not forgive earlier misses).
  const counted = { ...record, failures: before + 1 };
  await store.set(KEY, JSON.stringify(counted));
  if (await checkPin(pin, record.verifier)) {
    await store.set(KEY, JSON.stringify({ ...counted, failures: before }));
    return { ok: true, user: record.user };
  }
  if (before + 1 >= MAX_OFFLINE_FAILURES) {
    await store.remove(KEY);
    return { ok: false, disabled: true, left: 0 };
  }
  return { ok: false, left: MAX_OFFLINE_FAILURES - (before + 1) };
}
