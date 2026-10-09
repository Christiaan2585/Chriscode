// The "remember this device" token. Anyone holding it only still needs the 5-digit PIN, so it is not left readable
// in the browser profile: on the desktop it is encrypted with Windows' own per-user protection (Electron's
// safeStorage, see desktop-app/secret-store.js); on the phone it goes into the Android Keystore store. A plain
// browser (dev mode) keeps it in localStorage, and any storage that can't be written falls back to that rather
// than losing the sign-in. The value is read once at start (load) and then kept in memory so callers stay synchronous.
const KEY = "sandveld_remember_token";

export function createTokenStore({ secure, local, key = KEY }) {
  let cache = null;
  const readLocal = () => { try { return local.getItem(key); } catch { return null; } };
  const writeLocal = (value) => { try { local.setItem(key, value); } catch { /* storage blocked: memory only */ } };
  const removeLocal = () => { try { local.removeItem(key); } catch { /* nothing to remove */ } };

  return {
    async load() {
      let value = null;
      if (secure) { try { value = (await secure.get(key)) || null; } catch { value = null; } }
      const plain = readLocal();
      if (!value && plain) {
        value = plain;
        if (secure) { try { await secure.set(key, plain); removeLocal(); } catch { /* keep the plain copy: not lost */ } }
      } else if (value && plain) {
        removeLocal();
      }
      cache = value;
      return cache;
    },
    get: () => cache,
    async set(value) {
      cache = value;
      if (secure) { try { await secure.set(key, value); removeLocal(); return; } catch { /* fall back */ } }
      writeLocal(value);
    },
    async remove() {
      cache = null;
      removeLocal();
      if (secure) { try { await secure.remove(key); } catch { /* already gone */ } }
    },
  };
}

// Whichever protected store this device has.
async function deviceSecure() {
  const bridge = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (bridge?.secretGet) {
    return { get: (k) => bridge.secretGet(k), set: (k, v) => bridge.secretSet(k, v), remove: (k) => bridge.secretRemove(k) };
  }
  const { isNative } = await import("./pairing.js");
  if (isNative()) return (await import("../offline/store.js")).secure;
  return null;
}

let device = null;
const proxy = (method) => async (...args) => {
  if (!device) device = createTokenStore({ secure: await deviceSecure(), local: window.localStorage });
  return device[method](...args);
};
export const loadRememberToken = proxy("load");
export const setRememberToken = (value) => { if (device) return device.set(value); return proxy("set")(value); };
export const removeRememberToken = proxy("remove");
export const getRememberToken = () => (device ? device.get() : null);
