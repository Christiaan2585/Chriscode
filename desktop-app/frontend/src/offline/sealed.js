// Encryption for the phone's saved copy of the office data (offline/store.js). Every saved answer is stored as
// AES-256-GCM ciphertext; the key is 32 random bytes kept in the Keystore-sealed store (PairingStore secureSet - the
// Android Keystore key wraps it), never next to the data. So a copy of the app's files - a rooted phone, a forensic
// image - holds only ciphertext. GCM also refuses anything altered. A missing key or an unreadable entry just reads as
// "not saved": the phone downloads it again from the office PC.
const KEY_NAME = "offlineDataKey";
const VERSION = 1;

// In slices: spreading a whole multi-MB answer into one call overflows the stack.
const toBase64 = (bytes) => {
  const view = new Uint8Array(bytes);
  let text = "";
  for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
  return btoa(text);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** `keys` is the protected store ({get, set, remove}); `subtle` is WebCrypto (injectable for tests). */
export function createSealer(keys, cryptoImpl = globalThis.crypto) {
  let keyPromise = null;

  const loadKey = async (createIfMissing) => {
    const stored = await keys.get(KEY_NAME);
    if (stored) return cryptoImpl.subtle.importKey("raw", fromBase64(stored), "AES-GCM", false, ["encrypt", "decrypt"]);
    if (!createIfMissing) return null;
    const raw = cryptoImpl.getRandomValues(new Uint8Array(32));
    await keys.set(KEY_NAME, toBase64(raw));
    return cryptoImpl.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  };

  // One key per app run, made at most once even when several answers are saved at the same moment.
  const key = (createIfMissing) => {
    if (!keyPromise) {
      keyPromise = loadKey(createIfMissing).then((k) => {
        if (!k) keyPromise = null; // nothing yet: a later save may create it
        return k;
      }, (error) => { keyPromise = null; throw error; });
    }
    return keyPromise;
  };

  return {
    async seal(value) {
      const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
      const plain = new TextEncoder().encode(JSON.stringify(value));
      const data = await cryptoImpl.subtle.encrypt({ name: "AES-GCM", iv }, await key(true), plain);
      return { v: VERSION, iv: toBase64(iv), data: toBase64(data) };
    },
    async open(stored) {
      if (!stored || stored.v !== VERSION || typeof stored.iv !== "string" || typeof stored.data !== "string") return null;
      try {
        const k = await key(false);
        if (!k) return null;
        const plain = await cryptoImpl.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(stored.iv) }, k, fromBase64(stored.data));
        return JSON.parse(new TextDecoder().decode(plain));
      } catch {
        return null; // altered, or sealed with a key this phone no longer has
      }
    },
    async forgetKey() {
      keyPromise = null;
      await keys.remove(KEY_NAME);
    },
  };
}
