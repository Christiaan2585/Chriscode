// Where the phone keeps the saved copy of the office data: an IndexedDB database inside the app's
// own private storage (Android backups are off). Every saved answer is ENCRYPTED (AES-256-GCM, see
// sealed.js) with a key kept in the Keystore-sealed store, so a copy of the app's files holds only
// ciphertext. The offline PIN check lives separately in that same sealed store (PairingStore plugin).
import { PairingStorePlugin as plugin } from "../utils/pairing";
import { createSealer } from "./sealed";

const DB_NAME = "sandveld-offline";
const RESPONSES = "responses";
const META = "meta";

let opened = null;
const open = () => {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      // Version 2 = encrypted answers. Going from 1 drops the old, unencrypted answers (they are downloaded again).
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (event.oldVersion >= 1 && db.objectStoreNames.contains(RESPONSES)) db.deleteObjectStore(RESPONSES);
        db.createObjectStore(RESPONSES);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
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

// Small secrets sealed with the phone's Keystore key.
export const secure = {
  get: async (key) => (await plugin.secureGet({ key }))?.value ?? null,
  set: (key, value) => plugin.secureSet({ key, value }),
  remove: (key) => plugin.secureRemove({ key }),
};

const sealer = createSealer(secure);

// The saved answers (cachingAdapter's `store`): sealed on the way in, opened on the way out.
export const savedCopy = {
  get: async (key) => sealer.open(await run(RESPONSES, "readonly", (s) => s.get(key))),
  put: async (key, entry) => {
    const sealed = await sealer.seal(entry); // encrypt first: an IndexedDB transaction can't wait for WebCrypto
    return run(RESPONSES, "readwrite", (s) => s.put(sealed, key));
  },
  clear: () => run(RESPONSES, "readwrite", (s) => s.clear()),
  count: () => run(RESPONSES, "readonly", (s) => s.count()),
};

export const meta = {
  get: (key) => run(META, "readonly", (s) => s.get(key)),
  set: (key, value) => run(META, "readwrite", (s) => s.put(value, key)),
  clear: () => run(META, "readwrite", (s) => s.clear()),
};

// The saved answers and sync notes only (a different person signed in on this phone).
export async function wipeSavedCopy() {
  try {
    await savedCopy.clear();
    await meta.clear();
  } catch {
    // nothing saved yet
  }
  try {
    await sealer.forgetKey(); // a fresh key for the next person: nothing left behind can be read with it
  } catch {
    // not on a phone
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
