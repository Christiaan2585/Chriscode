import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Mail, MessageCircle, Send } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { treatmentMessage } from "../utils/clientSend";
import { sendLink } from "../utils/sending";
import { useRecordSend } from "../utils/useSends";

const iso = (d) => d.toISOString().slice(0, 10);
const AHEAD_DAYS = 21;
const button = "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-400 disabled:opacity-50";

// "Remind the farmer": the client's herding program dates for the next three weeks as a plain message (no file) in
// their language, to send on WhatsApp, by email or from the app. The text can be changed before it goes.
const TreatmentReminderDialog = ({ client, onClose }) => {
  const today = new Date();
  const { data: events, isLoading } = useQuery({
    queryKey: ["treatment-dates", client.id],
    queryFn: async () => (await apiClient.get("/programs/calendar", { params: { start: iso(today), end: iso(new Date(today.getTime() + AHEAD_DAYS * 86400000)) } })).data,
  });
  const { data: mail } = useQuery({ queryKey: ["mail-status"], queryFn: async () => (await apiClient.get("/mail/status")).data });
  const items = (events || []).filter((e) => e.client_id === client.id && e.status !== "done").map((e) => ({ date: e.date, label: e.stage || e.program_name }));
  const draft = treatmentMessage(client, items);
  const [edited, setEdited] = useState(null);
  const message = edited ?? draft?.message ?? "";
  const subject = draft?.subject || "";
  const [note, setNote] = useState(null);
  const record = useRecordSend();
  const doc = { kind: "treatments", send: { sendKind: "treatments", clientId: client.id } };
  const ref = { phone: client.phone, email: client.email, subject, message };

  const open = async (via) => {
    const url = sendLink(via, ref);
    if (!url) return setNote({ ok: false, text: via === "whatsapp" ? "This client has no phone number" : "This client has no email address" });
    if (window.electronAPI?.openSendLink) await window.electronAPI.openSendLink(url); else window.open(url, "_blank", "noopener,noreferrer");
    record(doc, via, via === "whatsapp" ? client.phone : client.email);
    setNote({ ok: true, text: via === "whatsapp" ? "WhatsApp opened with the message ready - press send there." : "Your email program opened with the message ready - press send there." });
  };
  const fromApp = async () => {
    const form = new FormData();
    form.append("to", (client.email || "").trim());
    form.append("subject", subject);
    form.append("message", message);
    try {
      await apiClient.post("/mail/send", form, { silent: true, headers: { "Content-Type": "multipart/form-data" } });
      record(doc, "app-email", client.email);
      setNote({ ok: true, text: `Sent to ${client.email}.` });
    } catch (err) {
      setNote({ ok: false, text: err?.response?.data?.detail?.toString?.() || "That didn't send." });
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Remind ${client.farm_name || client.name} of their program dates`} size="md">
      <div className="space-y-3 text-sm">
        {isLoading ? <p className="text-slate-500">Looking at the program…</p>
          : !draft ? <p className="text-slate-600">There are no program dates for this client in the next {AHEAD_DAYS / 7} weeks.</p>
          : (
            <>
              <label className="block"><span className="text-xs text-slate-500">Message (you can change it)</span>
                <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" rows={8}
                  value={message} onChange={(e) => setEdited(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={!client.phone} onClick={() => open("whatsapp")} title={client.phone ? "Send on WhatsApp" : "This client has no phone number"}><MessageCircle size={16} /> WhatsApp</button>
                {mail?.configured && <button type="button" className={button} disabled={!client.email} onClick={fromApp} title={client.email ? "Email it from the app" : "This client has no email address"}><Send size={16} /> Send from app</button>}
                <button type="button" className={button} disabled={!client.email} onClick={() => open("email")} title={client.email ? "Send by email" : "This client has no email address"}><Mail size={16} /> Email</button>
              </div>
            </>
          )}
        {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-emerald-700" : "text-red-600"}>{note.text}</p>}
      </div>
    </Modal>
  );
};

const TreatmentReminder = ({ client }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm text-sm font-medium">
        <BellRing size={18} /> Remind of dates
      </button>
      {open && <TreatmentReminderDialog client={client} onClose={() => setOpen(false)} />}
    </>
  );
};

export default TreatmentReminder;
