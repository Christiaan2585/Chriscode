import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import apiClient from "../../api/client";
import SettingsCard from "./SettingsCard";
import { DEFAULTS, MESSAGE_KINDS, previewMessage } from "../../utils/clientSend";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const LANGS = [["en", "English"], ["af", "Afrikaans"]];

// What differs from the standard wording - the only thing that is saved.
const overridesOf = (edits) => {
  const out = {};
  for (const [lang] of LANGS) {
    for (const { id } of MESSAGE_KINDS) {
      const e = edits[lang]?.[id];
      const d = DEFAULTS[lang][id];
      const kept = {};
      if (e && e.subject.trim() && e.subject.trim() !== d.subject) kept.subject = e.subject.trim();
      if (e && e.body.trim() && e.body.trim() !== d.body) kept.body = e.body.trim();
      if (Object.keys(kept).length) (out[lang] ||= {})[id] = kept;
    }
  }
  return out;
};

const startingPoint = (saved) => Object.fromEntries(LANGS.map(([lang]) => [lang, Object.fromEntries(MESSAGE_KINDS.map(({ id }) => [id, {
  subject: saved?.[lang]?.[id]?.subject || DEFAULTS[lang][id].subject,
  body: saved?.[lang]?.[id]?.body || DEFAULTS[lang][id].body,
}]))]));

// Settings -> Messages to clients (admins): the wording of everything the app writes to a client, in English and
// Afrikaans. The standard wording is filled in; change any of it, see how it will read, and Save.
const MessageWording = () => {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["business"], queryFn: async () => (await apiClient.get("/business/")).data });
  const [lang, setLang] = useState("en");
  const [edits, setEdits] = useState(() => startingPoint({}));
  const [note, setNote] = useState(null);
  useEffect(() => { if (data) setEdits(startingPoint(data.message_templates)); }, [data]);

  const save = useMutation({
    mutationFn: async () => (await apiClient.put("/business/messages", { templates: overridesOf(edits) }, { silent: true })).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["business"] }); setNote({ ok: true, text: "Saved. Messages from now on use this wording." }); },
    onError: (err) => setNote({ ok: false, text: err?.response?.data?.detail?.toString?.() || "That didn't save." }),
  });
  const set = (id, key, value) => setEdits({ ...edits, [lang]: { ...edits[lang], [id]: { ...edits[lang][id], [key]: value } } });
  const reset = (id) => setEdits({ ...edits, [lang]: { ...edits[lang], [id]: { ...DEFAULTS[lang][id] } } });

  return (
    <SettingsCard icon={MessageSquareText} title="Messages to clients">
      <p className="text-sm text-slate-600">
        This is what the app writes when you send a quote, an invoice, a reminder, a statement or program dates. Change any wording you like;
        each client gets the language set on their page. Words in curly brackets, like {"{name}"}, are filled in for each client.
      </p>
      <div className="flex gap-2" role="tablist" aria-label="Language">
        {LANGS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={lang === id} onClick={() => setLang(id)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${lang === id ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>{label}</button>
        ))}
      </div>
      <div className="space-y-5">
        {MESSAGE_KINDS.map((kind) => {
          const e = edits[lang][kind.id];
          const preview = previewMessage(kind.id, lang, e);
          const changed = e.subject !== DEFAULTS[lang][kind.id].subject || e.body !== DEFAULTS[lang][kind.id].body;
          return (
            <div key={kind.id} className="space-y-2 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-800">{kind.label}</h4>
                {changed && <button type="button" onClick={() => reset(kind.id)} className="text-sm font-medium text-emerald-700 hover:underline">Back to the standard wording</button>}
              </div>
              <label className="block"><span className="text-xs text-slate-500">Subject (emails)</span>
                <input className={field} maxLength={200} value={e.subject} onChange={(ev) => set(kind.id, "subject", ev.target.value)} /></label>
              <label className="block"><span className="text-xs text-slate-500">Message</span>
                <textarea className={field} rows={kind.id === "treatments" ? 4 : 3} maxLength={2000} value={e.body} onChange={(ev) => set(kind.id, "body", ev.target.value)} /></label>
              <p className="text-xs text-slate-500">You can use: {kind.placeholders.map((p) => `{${p}}`).join("  ")}</p>
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">How it will read</p>
                <p className="font-medium">{preview.subject}</p>
                <p className="whitespace-pre-line">{preview.message}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{save.isPending ? "Saving..." : "Save the wording"}</button>
        {note && <p role={note.ok ? "status" : "alert"} className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
      </div>
    </SettingsCard>
  );
};

export default MessageWording;
