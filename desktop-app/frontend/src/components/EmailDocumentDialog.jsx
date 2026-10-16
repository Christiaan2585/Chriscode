import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import apiClient from "../api/client";
import Modal from "./Modal";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";

// "Send from the app": the PDF goes to the office PC, which emails it through the business's own mail server
// (app/api/mail.py). `send` = { email, subject, message } as for the WhatsApp/Email buttons.
const EmailDocumentDialog = ({ blob, filename, send, onClose, onDone }) => {
  const [to, setTo] = useState(send.email || "");
  const [subject, setSubject] = useState(send.subject || "");
  const [message, setMessage] = useState(send.message || "");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("to", to.trim());
      form.append("subject", subject);
      form.append("message", message);
      form.append("file", new File([blob], filename, { type: "application/pdf" }));
      return apiClient.post("/mail/send", form, { silent: true, headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => { setError(""); setDone(true); send.onSent?.(); onDone?.(to.trim()); },
    onError: (err) => setError(Array.isArray(err?.response?.data?.detail) ? "That isn't a valid email address." : err?.response?.data?.detail?.toString?.() || "That didn't send."),
  });

  return (
    <Modal isOpen onClose={onClose} title="Send by email" size="md">
      {done ? (
        <div className="space-y-4 text-sm">
          <p role="status" className="text-emerald-700">Sent to {to.trim()}.</p>
          <button type="button" onClick={onClose} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">Close</button>
        </div>
      ) : (
        <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <label className="block"><span className="text-xs text-slate-500">To</span>
            <input className={field} type="email" required value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="block"><span className="text-xs text-slate-500">Subject</span>
            <input className={field} required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="block"><span className="text-xs text-slate-500">Message</span>
            <textarea className={field} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <p className="text-xs text-slate-500">Attached: {filename}</p>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <button type="submit" disabled={mutation.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {mutation.isPending ? "Sending..." : "Send"}
          </button>
        </form>
      )}
    </Modal>
  );
};

export default EmailDocumentDialog;
