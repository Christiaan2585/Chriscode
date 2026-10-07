import apiClient from "../api/client";

const API_PATH = { invoice: "invoices", quote: "quotes", "purchase-order": "purchase-orders" };

// `url` overrides the usual /{kind}s/{id}/pdf address (e.g. the product catalogue).
export async function fetchDocumentPdf(kind, id, url) {
  const response = await apiClient.get(url || `/${API_PATH[kind]}/${id}/pdf`, { responseType: "blob" });
  // Keep the type the server sent (a tax certificate may be a picture); everything else is a PDF.
  return new Blob([response.data], { type: response.data?.type || "application/pdf" });
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const pdfFilename = (kind, id, number) => `${number || `${kind}_${id}`}.pdf`;

// The catalogue as a fillable order form for one client (DocumentPreview doc).
// What they fill in comes back through the Quotes page's "Import order form".
// What goes with an order form sent to a client, in their language (utils/sending.js).
export const orderFormMessage = (client, lang) =>
  lang === "af"
    ? {
        subject: "Ons produkkatalogus en bestelvorm",
        message: `Goeie dag ${client.name}, hier is ons produkkatalogus met pryse. Merk wat u wil hê, tik hoeveel in die Hoev.-blokkies, stoor dan die PDF en stuur dit terug na ons. Dankie!`,
      }
    : {
        subject: "Our product catalogue and order form",
        message: `Good day ${client.name}, here is our product catalogue with prices. Tick what you want, type how many in the Qty boxes, then save the PDF and send it back to us. Thank you!`,
      };

// With `lang` ("en"/"af") it's the supplier's catalogue book with prices and
// Qty boxes (app/api/catalogue.py); without, the app's own catalogue.
export const orderFormFor = (client, lang = null) => {
  const name = client.name.replace(/[\\/:*?"<>|]+/g, "");
  return {
    kind: "catalogue",
    id: lang || "own",
    title: `order form for ${client.name}${lang === "af" ? " (Afrikaans)" : lang === "en" ? " (English)" : ""}`,
    url: lang ? `/catalogue/kyron/${lang}.pdf?client_id=${client.id}` : `/products/catalogue.pdf?client_id=${client.id}`,
    filename: lang === "af" ? `Bestelvorm - ${name}.pdf` : `Order form - ${name}.pdf`,
    hint: "Send it on WhatsApp or email. When it comes back filled in, use \"Import order form\" on the Quotes page.",
    send: { phone: client.phone, email: client.email, ...orderFormMessage(client, lang) },
  };
};

export async function downloadDocumentPdf(kind, id, number) {
  saveBlob(await fetchDocumentPdf(kind, id), pdfFilename(kind, id, number));
}

// Same rule as the backend (app/core/documents.py): discount off the line, rounded to cents.
export const lineTotal = (quantity, unitPrice, discountPercent) =>
  Math.round(Number(quantity) * Number(unitPrice) * (100 - (Number(discountPercent) || 0))) / 100;

export async function fetchDocumentItems(kind, id) {
  return (await apiClient.get(`/${API_PATH[kind]}/${id}/items`)).data;
}
