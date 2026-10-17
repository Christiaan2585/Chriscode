import { t } from "../../utils/i18n";
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, EyeOff, FileUp, ShieldCheck } from "lucide-react";
import apiClient from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { credentialProblems, parseGoogleCredentials } from "../../utils/googleCredentials";
import SettingsCard from "./SettingsCard";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const STEPS = [
  { title: "Make a free Google project", text: "Sign in with any Google account, give the project a name like Sandveld Vee Dienste and press Create.", url: "https://console.cloud.google.com/projectcreate", button: "Open Google Cloud" },
  { title: "Fill in the consent screen", text: "Choose External, type the app name, your email twice, and save through the steps. Under Test users, add the Gmail address of everyone who will sign in this way.", url: "https://console.cloud.google.com/apis/credentials/consent", button: "Open the consent screen" },
  { title: "Create the sign-in key", text: "Press Create credentials, then OAuth client ID, and choose Desktop app as the type. Google then shows the key: press Download JSON, or keep that window open.", url: "https://console.cloud.google.com/apis/credentials", button: "Open Credentials" },
];

// Settings -> Sign in with Google (admins). Google sign-in used to need a hand-edited file; now the three Google steps have
// buttons that open the right page, and the key is added here - by choosing the downloaded .json file, pasting what Google
// shows, or typing the two values. It switches on at once; the secret is stored encrypted and never shown again.
const GoogleSignInSettings = () => {
  const queryClient = useQueryClient();
  const { refreshGoogleStatus } = useAuth();
  const { data } = useQuery({ queryKey: ["google-config"], queryFn: async () => (await apiClient.get("/auth/google-config")).data });
  const [pasted, setPasted] = useState("");
  const [form, setForm] = useState({ clientId: "", clientSecret: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(null);

  const adopt = (text) => {
    const found = parseGoogleCredentials(text);
    setForm((prev) => ({ clientId: found.clientId || prev.clientId, clientSecret: found.clientSecret || prev.clientSecret }));
    return found;
  };
  const onPaste = (value) => {
    setPasted(value);
    const found = adopt(value);
    if (found.clientId || found.clientSecret) setPasted("");
  };
  const onFile = async (file) => {
    if (!file) return;
    if (file.size > 20000) return setNote({ ok: false, text: "That file is too big to be the one Google gave you." });
    const found = adopt(await file.text());
    setNote(found.clientId && found.clientSecret ? { ok: true, text: "Read it. Press the green button to turn Google sign-in on." } : { ok: false, text: "I couldn't find the Client ID and secret in that file. Try pasting them instead." });
  };

  const problems = credentialProblems(form);
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["google-config"] }); refreshGoogleStatus?.(); };
  const save = useMutation({
    mutationFn: async () => (await apiClient.put("/auth/google-config", { client_id: form.clientId.trim(), client_secret: form.clientSecret.trim() }, { silent: true })).data,
    onSuccess: () => { refresh(); setForm({ clientId: "", clientSecret: "" }); setEditing(false); setNote({ ok: true, text: "Google sign-in is on. The Continue with Google button is now on the sign-in screen." }); },
    onError: (e) => setNote({ ok: false, text: e?.response?.data?.detail?.toString?.() || "That didn't save." }),
  });
  const turnOff = useMutation({
    mutationFn: async () => (await apiClient.delete("/auth/google-config", { silent: true })).data,
    onSuccess: () => { refresh(); setNote({ ok: true, text: "Google sign-in is off. Everyone signs in with their email and password." }); },
    onError: () => setNote({ ok: false, text: "That didn't work." }),
  });

  const on = Boolean(data?.enabled);
  const showSetup = !on || editing;
  return (
    <SettingsCard icon={ShieldCheck} title={t("Sign in with Google")}>
      <p className="text-sm text-slate-600">{t("Staff with a Gmail address can sign in with one click instead of typing a password. Everyone still needs an account that an admin added.")}</p>
      <p className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${on ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600"}`}>
        {on ? <><CheckCircle2 size={16} /> {t("Google sign-in is on")} <span className="truncate font-normal text-emerald-700">({data.client_id?.slice(0, 14)}…)</span></> : t("Google sign-in is off. Follow the three steps below to turn it on.")}
      </p>

      {on && !editing && (
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => { setEditing(true); setNote(null); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">{t("Use a different key")}</button>
          <button type="button" disabled={turnOff.isPending} onClick={() => { if (window.confirm("Turn Google sign-in off? Everyone will sign in with their email and password.")) turnOff.mutate(); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-red-600 hover:bg-red-50">{t("Turn off")}</button>
          <p className="basis-full text-slate-500">{t("To let someone sign in with Google, add their Gmail address under Security & Auto-Lock, and as a Test user in Google (step 2).")}</p>
        </div>
      )}

      {showSetup && (
        <>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800">{t(step.title)}</span>
                  <span className="block text-slate-600">{t(step.text)}</span>
                  <a href={step.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-50">
                    {t(step.button)} <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </span>
              </li>
            ))}
          </ol>

          <div className="space-y-3 rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-medium text-slate-800">{t("Add the key here")}</p>
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:border-emerald-400">
              <FileUp size={16} aria-hidden="true" /> {t("Choose the file Google gave you (.json)")}
              <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <label className="block"><span className="text-xs text-slate-500">{t("or paste what Google shows (the two values can go in together)")}</span>
              <textarea className={field} rows={2} value={pasted} onChange={(e) => onPaste(e.target.value)} placeholder="Client ID … Client secret …" /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-xs text-slate-500">{t("Client ID")}</span>
                <input className={field} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} autoComplete="off" spellCheck={false} /></label>
              <label className="block"><span className="text-xs text-slate-500">{t("Client secret")}</span>
                <span className="relative block">
                  <input className={`${field} pr-10`} type={showSecret ? "text" : "password"} value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} autoComplete="off" spellCheck={false} />
                  <button type="button" onClick={() => setShowSecret(!showSecret)} aria-label={showSecret ? t("Hide the secret") : t("Show the secret")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span></label>
            </div>
            {(form.clientId || form.clientSecret) && problems.length > 0 && (
              <ul className="list-disc pl-5 text-amber-700">{problems.map((p) => <li key={p}>{p}.</li>)}</ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={problems.length > 0 || save.isPending} onClick={() => save.mutate()}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{save.isPending ? "Saving..." : t("Turn on Google sign-in")}</button>
              {editing && <button type="button" onClick={() => { setEditing(false); setForm({ clientId: "", clientSecret: "" }); }} className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">{t("Cancel")}</button>}
            </div>
            <p className="text-xs text-slate-400">{t("The secret is stored encrypted on this PC and is never shown again.")}</p>
          </div>
        </>
      )}
      {note && <p role={note.ok ? "status" : "alert"} className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
    </SettingsCard>
  );
};

export default GoogleSignInSettings;
