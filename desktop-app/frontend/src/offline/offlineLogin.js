// Unlocking the app with the PIN while the office PC cannot be reached. Saved after every
// successful online PIN entry; five wrong tries here switch it off until the next online
// sign-in, so a lost phone cannot be guessed at forever offline either. `store` is the
// Keystore-sealed text store ({get, set, remove}).
//
// Two limits keep this from outliving what the office PC has decided:
// - it only works for a while after the phone last checked in with the PC (a person removed or a
//   phone signed out on the PC would otherwise keep opening offline for ever);
// - guesses are counted BEFORE they are checked, one at a time, so firing many at once cannot
//   slip past the five-try limit. Every change to the saved record goes through that same line,
//   so a late check-in can never overwrite a lock-out or bring a removed record back.
// The week is measured with the phone's own clock, which a person holding the phone could change:
// moving it back to before the last time the record was used is noticed and refused. (A clock held
// still just short of the limit cannot be told apart from a quiet phone; the PIN is still needed.)
import { checkPin, makeVerifier } from "./pinVerifier.js";

export const MAX_OFFLINE_FAILURES = 5;
export const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const KEY = "offlineLogin";
const CLOCK_SLACK_MS = 5 * 60 * 1000; // ordinary clock corrections are fine

const read = async (store) => {
  try {
    const raw = await store.get(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

let queue = Promise.resolve(); // everything that changes the record, one after the other
const serial = (job) => {
  const result = queue.then(job);
  queue = result.catch(() => {});
  return result;
};

const seenAt = (record, now) => Math.max(record.seenAt || 0, record.verifiedAt || 0, now);

export const offlineLoginExists = async (store) => Boolean(await read(store));

export async function saveOfflineLogin(store, pin, user, { now = Date.now, ...options } = {}) {
  const verifier = await makeVerifier(pin, options);
  const at = now();
  await serial(() => store.set(KEY, JSON.stringify({ verifier, user, failures: 0, verifiedAt: at, seenAt: at })));
}

// The saved user (a new name or photo) without touching the PIN.
export const updateOfflineUser = (store, user) =>
  serial(async () => {
    const record = await read(store); // read inside the line: a removed record stays removed
    if (record) await store.set(KEY, JSON.stringify({ ...record, user }));
  });

// The phone has just talked to the office PC with a valid sign-in: offline unlock stays good for another week.
export const touchOfflineLogin = (store, { now = Date.now } = {}) =>
  serial(async () => {
    const record = await read(store);
    if (!record) return;
    const at = Math.max(now(), seenAt(record, 0));
    await store.set(KEY, JSON.stringify({ ...record, verifiedAt: at, seenAt: at }));
  });

export const clearOfflineLogin = (store) => serial(() => store.remove(KEY));


/** -> {ok: true, user} | {ok: false, left} | {ok: false, disabled: true} | {ok: false, expired: true} */
export const tryOfflineUnlock = (store, pin, { now = Date.now } = {}) => serial(() => attemptOnce(store, pin, now));

async function attemptOnce(store, pin, now) {
  const record = await read(store);
  if (!record) return { ok: false, disabled: true };
  const clock = now();
  const lastSeen = Math.max(record.seenAt || 0, record.verifiedAt || 0);
  // Too long since the phone checked in with the PC - or the clock has been set back to before the record was last used.
  if (clock - (record.verifiedAt || 0) > OFFLINE_MAX_AGE_MS || clock + CLOCK_SLACK_MS < lastSeen) {
    await store.remove(KEY);
    return { ok: false, expired: true, disabled: true };
  }
  const before = record.failures || 0;
  if (before >= MAX_OFFLINE_FAILURES) {
    await store.remove(KEY);
    return { ok: false, disabled: true, left: 0 };
  }
  // Count this guess first; only a right PIN gives the count back to what it was (it does not forgive earlier misses).
  const counted = { ...record, failures: before + 1, seenAt: Math.max(lastSeen, clock) };
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
