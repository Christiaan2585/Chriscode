// Photos taken where there is no signal: the phone keeps them (sealed with the phone's Keystore-backed key, like the saved
// copy of the office data) and uploads them to the client's page once the office PC can be reached. Only the unsent photo is
// stored, and it is deleted as soon as the PC has it. Each photo is read back and sent in order; one the PC refuses for
// good (a deleted client, a file it won't accept) is dropped rather than retried for ever.
//
// `createPhotoQueue({ store, seal, open })` is storage-agnostic (tested with an in-memory store); `photoQueue` below is the
// real one, using IndexedDB in the app's private storage.

const toBase64 = (bytes) => {
  const view = new Uint8Array(bytes);
  let text = "";
  for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
  return btoa(text);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// No answer at all (offline) or not signed in yet: try again later.
const isRetryable = (error) => !error?.response || error.response.status === 401;

export function createPhotoQueue({ store, seal, open }) {
  return {
    async add({ clientId, caption, name, type, bytes }) {
      return store.add(await seal({ clientId: Number(clientId), caption: caption || "", name: name || "photo.jpg", type: type || "image/jpeg", data: toBase64(bytes) }));
    },
    async count(clientId) {
      const rows = await store.all();
      if (clientId === undefined) return rows.length;
      let n = 0;
      for (const { value } of rows) if ((await open(value))?.clientId === Number(clientId)) n += 1;
      return n;
    },
    /** upload({ clientId, caption, file }) -> a promise. Returns { sent, dropped, remaining }. */
    async flush(upload) {
      const result = { sent: 0, dropped: 0, remaining: 0 };
      const rows = (await store.all()).sort((a, b) => a.id - b.id);
      for (let i = 0; i < rows.length; i += 1) {
        const entry = await open(rows[i].value);
        if (!entry) { await store.remove(rows[i].id); result.dropped += 1; continue; } // unreadable: made with a key this phone no longer has
        const file = new File([fromBase64(entry.data)], entry.name, { type: entry.type });
        try {
          await upload({ clientId: entry.clientId, caption: entry.caption, file });
          await store.remove(rows[i].id);
          result.sent += 1;
        } catch (error) {
          if (isRetryable(error)) { result.remaining = rows.length - i; return result; }
          await store.remove(rows[i].id);
          result.dropped += 1;
        }
      }
      return result;
    },
  };
}
