import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import Modal from "./Modal";
import { fetchDocumentPdf, pdfFilename, saveBlob } from "../utils/documents";

const LABEL = { invoice: "Invoice", quote: "Quote" };

// Shows the real PDF (the same file Download saves) in Electron's built-in
// PDF viewer. The packaged CSP allows this via frame-src blob: - see
// registerContentSecurityPolicy() in desktop-app/index.js.
// `doc` is { kind: "invoice" | "quote", id } or null when closed.
const DocumentPreview = ({ doc, onClose }) => {
  const { data: blob, isLoading, isError } = useQuery({
    queryKey: ["document-pdf", doc?.kind, doc?.id],
    queryFn: () => fetchDocumentPdf(doc.kind, doc.id),
    enabled: Boolean(doc),
    gcTime: 0, // always re-render from current data - an edit changes the PDF
  });

  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) return undefined;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [blob]);

  const title = doc ? `${LABEL[doc.kind]} #${doc.id}` : "";

  return (
    <Modal isOpen={Boolean(doc)} onClose={onClose} title={`${title} preview`} size="xl">
      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!blob}
            onClick={() => saveBlob(blob, pdfFilename(doc.kind, doc.id))}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download size={16} /> Download PDF
          </button>
        </div>
        <div className="h-[70vh] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {isError ? (
            <p className="p-8 text-center text-sm text-red-600">Couldn't load the PDF for {title}.</p>
          ) : isLoading || !url ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading {title}…</p>
          ) : (
            <iframe src={url} title={`${title} PDF`} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DocumentPreview;
