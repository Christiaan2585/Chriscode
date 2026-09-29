import apiClient from "../api/client";

const API_PATH = { invoice: "invoices", quote: "quotes", "purchase-order": "purchase-orders" };

// `url` overrides the usual /{kind}s/{id}/pdf address (e.g. the product catalogue).
export async function fetchDocumentPdf(kind, id, url) {
  const response = await apiClient.get(url || `/${API_PATH[kind]}/${id}/pdf`, { responseType: "blob" });
  return new Blob([response.data], { type: "application/pdf" });
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
export const orderFormFor = (client) => ({
  kind: "catalogue",
  title: `order form for ${client.name}`,
  url: `/products/catalogue.pdf?client_id=${client.id}`,
  filename: `Order form - ${client.name.replace(/[\\/:*?"<>|]+/g, "")}.pdf`,
  hint: "Download it and send it on WhatsApp or email. When it comes back filled in, use \"Import order form\" on the Quotes page.",
});

export async function downloadDocumentPdf(kind, id, number) {
  saveBlob(await fetchDocumentPdf(kind, id), pdfFilename(kind, id, number));
}

// Same rule as the backend (app/core/documents.py): discount off the line, rounded to cents.
export const lineTotal = (quantity, unitPrice, discountPercent) =>
  Math.round(Number(quantity) * Number(unitPrice) * (100 - (Number(discountPercent) || 0))) / 100;

export async function fetchDocumentItems(kind, id) {
  return (await apiClient.get(`/${API_PATH[kind]}/${id}/items`)).data;
}
