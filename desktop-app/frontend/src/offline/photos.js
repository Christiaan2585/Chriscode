// The phone's real photo queue (see photoQueue.js for the rules): IndexedDB in the app's private storage, sealed with the
// same Keystore-backed key as the saved copy of the office data.
import apiClient from "../api/client";
import { createPhotoQueue } from "./photoQueue";
import { seal, unseal } from "./store";

const DB_NAME = "sandveld-photo-queue";
const STORE = "photos";

let opened = null;
const open = () => {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { autoIncrement: true });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    opened.catch(() => { opened = null; });
  }
  return opened;
};

const run = async (mode, action) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const idbStore = {
  add: (value) => run("readwrite", (s) => s.add(value)),
  all: async () => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const rows = [];
      const request = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { rows.push({ id: cursor.key, value: cursor.value }); cursor.continue(); } else resolve(rows);
      };
      request.onerror = () => reject(request.error);
    });
  },
  remove: (id) => run("readwrite", (s) => s.delete(id)),
};

export const photoQueue = createPhotoQueue({ store: idbStore, seal, open: unseal });

export const uploadPhoto = async ({ clientId, caption, file }) => {
  const form = new FormData();
  form.append("file", file);
  form.append("caption", caption || "");
  return (await apiClient.post(`/photos/client/${clientId}`, form, { headers: { "Content-Type": "multipart/form-data" }, silent: true, queueable: true })).data;
};

let flushing = false;
/** Upload whatever is waiting; returns { sent, dropped, remaining } (or null while another run is going). */
export async function flushPhotos() {
  if (flushing) return null;
  flushing = true;
  try {
    return await photoQueue.flush(uploadPhoto);
  } finally {
    flushing = false;
  }
}
