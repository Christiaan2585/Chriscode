// Where the phone keeps the saved copy of the office data: an IndexedDB database inside the app's
// own private storage (nothing else on the phone can read it, and Android backups are off). The
// offline PIN check lives separately in the Keystore-sealed store (PairingStore plugin).
import { PairingStorePlugin as plugin } from "../utils/pairing";

const DB_NAME = "sandveld-offline";
const RESPONSES = "responses";
const META = "meta";

let opened = null;
const open = () => {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(RESPONSES);
        request.result.createObjectStore(META);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    opened.catch(() => { opened = null; });
  }
  return opened;
};

const run = async (storeName, mode, action) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

// The saved answers (cachingAdapter's `store`).
export const savedCopy = {
  get: (key) => run(RESPONSES, "readonly", (s) => s.get(key)),
  put: (key, entry) => run(RESPONSES, "readwrite", (s) => s.put(entry, key)),
  clear: () => run(RESPONSES, "readwrite", (s) => s.clear()),
  count: () => run(RESPONSES, "readonly", (s) => s.count()),
};

export const meta = {
  get: (key) => run(META, "readonly", (s) => s.get(key)),
  set: (key, value) => run(META, "readwrite", (s) => s.put(value, key)),
  clear: () => run(META, "readwrite", (s) => s.clear()),
};

// Small secrets sealed with the phone's Keystore key.
export const secure = {
  get: async (key) => (await plugin.secureGet({ key }))?.value ?? null,
  set: (key, value) => plugin.secureSet({ key, value }),
  remove: (key) => plugin.secureRemove({ key }),
};

// The saved answers and sync notes only (a different person signed in on this phone).
export async function wipeSavedCopy() {
  try {
    await savedCopy.clear();
    await meta.clear();
  } catch {
    // nothing saved yet
  }
}

// Everything saved for this office PC: the answers, the sync notes and the offline PIN check.
export async function wipeOfflineData() {
  await wipeSavedCopy();
  try {
    await secure.remove("offlineLogin");
  } catch {
    // not on a phone
  }
}
