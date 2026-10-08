import { Capacitor } from "@capacitor/core";

// Android's web view cannot show a PDF in a frame or save a blob: link, so on the phone a
// document is written to the app's cache and handed to the system share sheet instead: from
// there it opens in the phone's PDF app, or goes to WhatsApp, email or a printer.
export const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Only a plain file name ever reaches the cache folder.
const safeName = (name) => String(name || "document.pdf").replace(/[\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "") || "document.pdf";

export async function shareBlob(blob, filename, { title, text } = {}) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const written = await Filesystem.writeFile({ path: safeName(filename), data: await toBase64(blob), directory: Directory.Cache });
  await Share.share({ title, text, url: written.uri, dialogTitle: title });
}
