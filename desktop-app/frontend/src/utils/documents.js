import apiClient from "../api/client";

const API_PATH = { invoice: "invoices", quote: "quotes" };

export async function fetchDocumentPdf(kind, id) {
  const response = await apiClient.get(`/${API_PATH[kind]}/${id}/pdf`, { responseType: "blob" });
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

export const pdfFilename = (kind, id) => `${kind}_${id}.pdf`;

export async function downloadDocumentPdf(kind, id) {
  saveBlob(await fetchDocumentPdf(kind, id), pdfFilename(kind, id));
}

export async function fetchDocumentItems(kind, id) {
  return (await apiClient.get(`/${API_PATH[kind]}/${id}/items`)).data;
}
