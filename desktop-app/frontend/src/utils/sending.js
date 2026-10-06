import { saveBlob } from "./documents";
import { toWhatsAppLink } from "./contact";

const EMAIL = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

export const sendLink = (via, { phone, email, subject, message }) => {
  if (via === "whatsapp") return toWhatsAppLink(phone, message);
  const address = (email || "").trim();
  return EMAIL.test(address)
    ? `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    : null;
};

// WhatsApp and email can't be handed a file by the app, so: save the PDF where
// it's easy to find (the desktop app also shows it selected in Explorer), then
// open the chat / email with the message ready - the user drags the file in.
export async function sendDocument(blob, filename, via, send) {
  const url = sendLink(via, send);
  if (!url) throw new Error(via === "whatsapp" ? "This client has no phone number" : "This client has no email address");
  const api = window.electronAPI;
  let savedTo = null;
  if (api?.saveForSending) {
    const result = await api.saveForSending(filename, await blob.arrayBuffer());
    if (result?.error) throw new Error(result.error);
    savedTo = result.path;
  } else {
    saveBlob(blob, filename);
  }
  if (api?.openSendLink) await api.openSendLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
  return savedTo;
}
