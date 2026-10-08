// Unlocking the app with the PIN while the office PC cannot be reached. Saved after every
// successful online PIN entry; five wrong tries here switch it off until the next online
// sign-in, so a lost phone cannot be guessed at forever offline either. `store` is the
// Keystore-sealed text store ({get, set, remove}).
import { checkPin, makeVerifier } from "./pinVerifier.js";

export const MAX_OFFLINE_FAILURES = 5;
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

export async function saveOfflineLogin(store, pin, user, options) {
  await store.set(KEY, JSON.stringify({ verifier: await makeVerifier(pin, options), user, failures: 0 }));
}

// The saved user (a new name or photo) without touching the PIN.
export async function updateOfflineUser(store, user) {
  const record = await read(store);
  if (record) await store.set(KEY, JSON.stringify({ ...record, user }));
}

export const clearOfflineLogin = (store) => store.remove(KEY);

/** -> {ok: true, user} | {ok: false, left} | {ok: false, disabled: true} */
export async function tryOfflineUnlock(store, pin) {
  const record = await read(store);
  if (!record) return { ok: false, disabled: true };
  if (await checkPin(pin, record.verifier)) return { ok: true, user: record.user };
  const failures = (record.failures || 0) + 1;
  if (failures >= MAX_OFFLINE_FAILURES) {
    await store.remove(KEY);
    return { ok: false, disabled: true, left: 0 };
  }
  await store.set(KEY, JSON.stringify({ ...record, failures }));
  return { ok: false, left: MAX_OFFLINE_FAILURES - failures };
}
