import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Mail, MessageCircle, Printer } from "lucide-react";
import Modal from "./Modal";
import { fetchDocumentPdf, pdfFilename, saveBlob } from "../utils/documents";
import { sendDocument, sendLink } from "../utils/sending";
import { isNativeApp } from "../utils/nativeFiles";

const sendButton =
  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-400 disabled:opacity-50";

// "Send on WhatsApp" / "Send by email" for a document meant for a client
// (doc.send = { phone, email, subject, message }) - see utils/sending.js.
const SendButtons = ({ blob, filename, send }) => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (via) => {
    setBusy(true);
    setStatus(null);
    try {
      const savedTo = await sendDocument(blob, filename, via, send);
      const app = via === "whatsapp" ? "WhatsApp" : "your email";
      setStatus({ ok: true, text: savedTo
        ? `Saved in Documents > Sandveld Vee Dienste > Sent to clients (shown in Explorer) and opened ${app} - drag the file in and send.`
        : `Downloaded and opened ${app} - attach the file and send.` });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };
  const noPhone = !sendLink("whatsapp", send);
  const noEmail = !sendLink("email", send);
  return (
    <>
      <button type="button" className={sendButton} disabled={!blob || busy || noPhone} onClick={() => go("whatsapp")}
        title={noPhone ? "This client has no phone number" : "Send on WhatsApp"}>
        <MessageCircle size={16} /> WhatsApp
      </button>
      <button type="button" className={sendButton} disabled={!blob || busy || noEmail} onClick={() => go("email")}
        title={noEmail ? "This client has no email address" : "Send by email"}>
        <Mail size={16} /> Email
      </button>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`basis-full text-sm ${status.ok ? "text-emerald-700" : "text-red-600"}`}>
          {status.text}
        </p>
      )}
    </>
  );
};

const LABEL = { invoice: "Invoice", quote: "Quote", "purchase-order": "Purchase order", catalogue: "Product", program: "Herding program", "program-costs": "Herding program", "tax-certificate": "Tax certificate", "catalogue-library": "Catalogue" };

// Shows the real PDF (the same file Download saves) in Electron's built-in
// PDF viewer. The packaged CSP allows this via frame-src blob: - see
// registerContentSecurityPolicy() in desktop-app/index.js.
// `doc` is { kind: "invoice" | "quote" | "purchase-order" | "catalogue", id, title?, url?, filename?, hint? }
// or null when closed.
const DocumentPreview = ({ doc, onClose }) => {
  const { data: blob, isLoading, isError } = useQuery({
    queryKey: ["document-pdf", doc?.kind, doc?.id, doc?.url],
    queryFn: () => fetchDocumentPdf(doc.kind, doc.id, doc.url),
    enabled: Boolean(doc),
    gcTime: 0, // always re-render from current data - an edit changes the PDF
  });

  const phone = isNativeApp(); // Android's web view cannot show a PDF in a frame
  const [url, setUrl] = useState(null);
  const frame = useRef(null);
  const [printProblem, setPrintProblem] = useState(null);
  useEffect(() => setPrintProblem(null), [doc]);
  useEffect(() => {
    if (!blob) return undefined;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [blob]);

  // The desktop app's built-in PDF viewer has no working Print button, so the
  // app prints the PDF itself (main process, Windows print dialog). In a plain
  // browser the PDF viewer's own print is used.
  const printIt = async () => {
    setPrintProblem(null);
    try {
      if (window.electronAPI?.printPdf) {
        const result = await window.electronAPI.printPdf(await blob.arrayBuffer());
        if (result?.error) setPrintProblem(result.error);
      } else {
        frame.current.contentWindow.focus();
        frame.current.contentWindow.print();
      }
    } catch {
      setPrintProblem("Couldn't start printing. Download the PDF and print it from there.");
    }
  };

  const title = doc ? `${LABEL[doc.kind]} ${doc.title || `#${doc.id}`}` : "";
  const filename = doc ? doc.filename || pdfFilename(doc.kind, doc.id, doc.title) : "";

  return (
    <Modal isOpen={Boolean(doc)} onClose={onClose} title={`${title} preview`} size="xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {doc?.hint && <p className="mr-auto text-sm text-slate-600">{doc.hint}</p>}
          {doc?.send && <SendButtons key={doc.url} blob={blob} filename={filename} send={doc.send} />}
          {!doc?.noPrint && !phone && (
            <button type="button" disabled={!blob} onClick={printIt} className={sendButton}>
              <Printer size={16} /> Print
            </button>
          )}
          <button
            type="button"
            disabled={!blob}
            onClick={() => saveBlob(blob, filename)}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download size={16} /> {phone ? "Open or share" : "Download"}
          </button>
        </div>
        {printProblem && <p role="alert" className="text-sm text-red-600">{printProblem}</p>}
        <div className="h-[70vh] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {isError ? (
            <p className="p-8 text-center text-sm text-red-600">Couldn't load the PDF for {title}.</p>
          ) : isLoading || !url ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading {title}…</p>
          ) : phone ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-slate-600">
              <p>{title} is ready. On a phone it opens in your PDF app, or you can send it by WhatsApp or email.</p>
              <button type="button" onClick={() => saveBlob(blob, filename)}
                className="rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-emerald-700">Open or share</button>
            </div>
          ) : (
            <iframe ref={frame} src={url} title={`${title} PDF`} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DocumentPreview;
