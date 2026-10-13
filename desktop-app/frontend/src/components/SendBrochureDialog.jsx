import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { clientService } from "../api/services";
import { fetchDocumentPdf } from "../utils/documents";
import { sendDocument } from "../utils/sending";
import { farmLabel, shortDate } from "../utils/format";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";

// {name} becomes each client's own name when it is sent.
const MESSAGES = {
  en: (title) => `Good day {name}, here is our brochure: ${title}. Please let us know if you would like to order. Thank you!`,
  af: (title) => `Goeie dag {name}, hier is ons brosjure: ${title}. Laat weet ons asseblief as u wil bestel. Dankie!`,
};

// "Send to clients": tick any number of clients. Email goes out in one go (the office PC sends one message per client
// through the business's own mail server, app/core/brochures.py); WhatsApp is one client at a time because the app
// cannot hand WhatsApp a file - it saves the PDF and opens the chat, as for order forms.
const SendBrochureDialog = ({ book, onClose }) => {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: clientService.getAll });
  const { data: mail } = useQuery({ queryKey: ["mail-status"], queryFn: async () => (await apiClient.get("/mail/status")).data });
  const sendsKey = ["brochure-sends", book.id];
  const { data: sends = {} } = useQuery({ queryKey: sendsKey, queryFn: async () => (await apiClient.get(`/catalogue/library/${book.id}/sends`)).data });
  const { data: pdf } = useQuery({
    queryKey: ["brochure-pdf", book.id],
    queryFn: () => fetchDocumentPdf("catalogue-library", book.id, `/catalogue/library/${book.id}.pdf`),
    gcTime: 0,
  });
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [subject, setSubject] = useState(book.name);
  const [message, setMessage] = useState(MESSAGES.en(book.name));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [waNote, setWaNote] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => !q || `${c.name} ${c.farm_name || ""} ${c.email || ""}`.toLowerCase().includes(q))
      .sort((a, b) => farmLabel(a).localeCompare(farmLabel(b)));
  }, [clients, search]);
  const chosen = clients.filter((c) => picked.has(c.id));
  const withEmail = chosen.filter((c) => (c.email || "").trim());
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const tickAll = (list) => setPicked((s) => new Set([...s, ...list.map((c) => c.id)]));

  const email = useMutation({
    mutationFn: () => apiClient.post(`/catalogue/library/${book.id}/email`, { client_ids: chosen.map((c) => c.id), subject, message }, { silent: true }).then((r) => r.data),
    onSuccess: (data) => { setError(""); setResult(data); queryClient.invalidateQueries({ queryKey: sendsKey }); },
    onError: (err) => { const d = err?.response?.data?.detail; setError(typeof d === "string" ? d : "That did not send - check the clients you ticked."); },
  });

  const whatsapp = async (client) => {
    setWaNote("");
    try {
      await sendDocument(pdf, `${book.name}.pdf`, "whatsapp", { phone: client.phone, message: message.replace("{name}", client.name) });
      await apiClient.post(`/catalogue/library/${book.id}/sent`, { client_id: client.id, via: "whatsapp" }, { silent: true });
      queryClient.invalidateQueries({ queryKey: sendsKey });
      setWaNote(`WhatsApp opened for ${farmLabel(client)} - drag the saved PDF into the chat and send.`);
    } catch (err) {
      setWaNote(err.message || "Could not open WhatsApp.");
    }
  };

  const names = (rows) => rows.map((r) => r.name).join(", ");
  return (
    <Modal isOpen onClose={onClose} title={`Send ${book.name}`} size="xl">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Choose clients" className="space-y-2">
          <input className={field} type="search" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex flex-wrap gap-3 text-xs">
            <button type="button" className="text-emerald-700 hover:underline" onClick={() => tickAll(shown.filter((c) => (c.email || "").trim()))}>Tick everyone with an email address</button>
            <button type="button" className="text-emerald-700 hover:underline" onClick={() => tickAll(shown)}>Tick all shown</button>
            <button type="button" className="text-slate-500 hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
            {shown.map((c) => {
              const sent = sends[c.id];
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{farmLabel(c)}</span>
                      <span className="block truncate text-xs text-slate-500">{c.email || "no email"} · {c.phone || "no phone"}</span>
                    </span>
                    {sent && <span className="shrink-0 text-xs text-emerald-700">sent {shortDate(sent.at)}</span>}
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No clients match.</li>}
          </ul>
          <p className="text-xs text-slate-500">{chosen.length} ticked · {withEmail.length} with an email address</p>
        </section>

        <section aria-label="Message" className="space-y-3 text-sm">
          <label className="block"><span className="text-xs text-slate-500">Subject</span>
            <input className={field} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="block">
            <span className="flex items-center justify-between text-xs text-slate-500">
              <span>Message ({"{name}"} becomes the client's name)</span>
              <span className="flex gap-2">
                <button type="button" className="text-emerald-700 hover:underline" onClick={() => setMessage(MESSAGES.en(book.name))}>English</button>
                <button type="button" className="text-emerald-700 hover:underline" onClick={() => setMessage(MESSAGES.af(book.name))}>Afrikaans</button>
              </span>
            </span>
            <textarea className={field} rows={5} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>

          <button type="button" disabled={!mail?.configured || !withEmail.length || !subject.trim() || email.isPending}
            onClick={() => email.mutate()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <Mail size={16} /> {email.isPending ? "Sending..." : `Email ${withEmail.length} ${withEmail.length === 1 ? "client" : "clients"}`}
          </button>
          {mail && !mail.configured && <p className="text-xs text-amber-700">Email is not set up yet - an admin can do that in Settings &gt; Email. WhatsApp below still works.</p>}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          {result && (
            <div role="status" className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="font-medium text-emerald-700">Sent to {result.sent.length} {result.sent.length === 1 ? "client" : "clients"}.</p>
              {result.skipped.length > 0 && <p className="text-slate-600">No email address, skipped: {names(result.skipped)}</p>}
              {result.failed.length > 0 && <p className="text-red-700">The mail server refused: {names(result.failed)}</p>}
              {result.stopped && <p className="text-red-700">Stopped: {result.stopped}. Not sent: {names(result.not_sent)}</p>}
            </div>
          )}

          <div className="space-y-1 border-t border-slate-100 pt-3">
            <p className="flex items-center gap-1 text-xs font-medium text-slate-500"><MessageCircle size={14} /> WhatsApp - one client at a time</p>
            {chosen.filter((c) => (c.phone || "").trim()).length === 0
              ? <p className="text-xs text-slate-400">Tick clients that have a phone number.</p>
              : (
                <ul className="max-h-40 space-y-1 overflow-auto">
                  {chosen.filter((c) => (c.phone || "").trim()).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{farmLabel(c)}</span>
                      <button type="button" disabled={!pdf} onClick={() => whatsapp(c)}
                        className="shrink-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400 disabled:opacity-50">WhatsApp</button>
                    </li>
                  ))}
                </ul>
              )}
            {waNote && <p role="status" className="text-xs text-emerald-700">{waNote}</p>}
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default SendBrochureDialog;
