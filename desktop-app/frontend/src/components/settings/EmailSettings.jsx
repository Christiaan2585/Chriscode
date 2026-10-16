import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Mail } from "lucide-react";
import apiClient from "../../api/client";
import SettingsCard from "./SettingsCard";
import { PROVIDERS, applyProvider, detectProvider, effectiveUsername, friendlyMailError, providerById } from "../../utils/mailProviders";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const BLANK = { host: "", port: 587, security: "starttls", username: "", password: "", from_address: "", from_name: "" };

// Settings -> Email (admins): the business's own email account, so a quote, invoice or statement can be emailed
// straight from the app. Pick the provider (its server is filled in), type the address and password, press one button:
// it saves and sends a test email to that address. The password is stored encrypted and never shown again.
const EmailSettings = () => {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["mail-settings"], queryFn: async () => (await apiClient.get("/mail/settings")).data });
  const [form, setForm] = useState(BLANK);
  const [provider, setProvider] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => {
    if (!data) return;
    setForm({ ...BLANK, ...data, username: data.username || "", from_name: data.from_name || "", password: "" });
    setProvider(data.host ? detectProvider(data.host) : null);
  }, [data]);

  const chosen = provider ? providerById(provider) : null;
  const isSetUp = Boolean(data?.host && data?.from_address);
  const say = (ok, text) => setNote({ ok, text });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const pick = (id) => { setProvider(id); setForm(applyProvider(form, id)); setNote(null); };

  const saveAndTest = useMutation({
    onMutate: () => setNote(null), // never leave the last result on screen while a new attempt runs
    mutationFn: async () => {
      const address = form.from_address.trim();
      await apiClient.put("/mail/settings", { ...form, from_address: address, username: effectiveUsername(form), port: Number(form.port), password: form.password || null }, { silent: true });
      queryClient.invalidateQueries({ queryKey: ["mail-settings"] });
      queryClient.invalidateQueries({ queryKey: ["mail-status"] });
      await apiClient.post("/mail/test", { to: address }, { silent: true });
      return address;
    },
    onSuccess: (address) => say(true, `All set. A test email is on its way to ${address} - check that inbox (and the spam folder). You can now send quotes, invoices and statements from the app.`),
    onError: (err) => {
      const raw = err?.response?.data?.detail;
      say(false, Array.isArray(raw) ? "Check the details: the email address and the server name must be filled in properly." : friendlyMailError(raw?.toString?.(), provider));
    },
  });

  return (
    <SettingsCard icon={Mail} title="Email">
      <p className="text-sm text-slate-600">
        Connect your email account, and a quote, invoice or statement can be emailed to a client from the app with one click.
        It goes straight from this computer to your email provider.
      </p>
      {isSetUp && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0" /> Email is set up: sending as {data.from_address}.
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">1. Who provides your email?</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Email provider">
          {PROVIDERS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={provider === p.id} onClick={() => pick(p.id)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${provider === p.id ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400"}`}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {chosen && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveAndTest.mutate(); }}>
          <p className="text-sm font-medium text-slate-700">2. Your email account</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {chosen.help}
            {chosen.link && (
              <a href={chosen.link.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 font-medium text-emerald-700 hover:underline">
                {chosen.link.label} <ExternalLink size={14} />
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label><span className="text-xs text-slate-500">Your email address</span>
              <input className={field} type="email" required autoComplete="off" placeholder="you@example.com" value={form.from_address} onChange={set("from_address")} /></label>
            <label><span className="text-xs text-slate-500">
              {chosen.appPassword ? "App password" : "Password"} {data?.has_password && "(saved - leave blank to keep it)"}</span>
              <span className="relative block">
                <input className={`${field} pr-10`} type={showPassword ? "text" : "password"} autoComplete="new-password" required={!data?.has_password}
                  value={form.password} onChange={set("password")} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide the password" : "Show the password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span></label>
            <label className="sm:col-span-2"><span className="text-xs text-slate-500">Name your clients see</span>
              <input className={field} maxLength={100} placeholder="Sandveld Vee Dienste" value={form.from_name} onChange={set("from_name")} /></label>
          </div>

          <details className="rounded-lg border border-slate-200 px-3 py-2 text-sm" open={provider === "other"}>
            <summary className="cursor-pointer font-medium text-slate-700">Server details {provider !== "other" && <span className="font-normal text-slate-500">(filled in for you)</span>}</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="text-xs text-slate-500">Outgoing mail (SMTP) server</span>
                <input className={field} required placeholder="smtp.example.com" value={form.host} onChange={set("host")} /></label>
              <label><span className="text-xs text-slate-500">Security</span>
                <select className={field} value={form.security} onChange={(e) => setForm({ ...form, security: e.target.value, port: e.target.value === "ssl" ? 465 : 587 })}>
                  <option value="starttls">STARTTLS (usually port 587)</option>
                  <option value="ssl">SSL/TLS (usually port 465)</option>
                </select></label>
              <label><span className="text-xs text-slate-500">Port</span>
                <input className={field} type="number" min="1" max="65535" required value={form.port} onChange={set("port")} /></label>
              <label className="sm:col-span-2"><span className="text-xs text-slate-500">User name (leave blank to use your email address)</span>
                <input className={field} autoComplete="off" value={form.username} onChange={set("username")} /></label>
            </div>
          </details>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">3. Save and check it works</p>
            <button type="submit" disabled={saveAndTest.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saveAndTest.isPending ? "Saving and sending a test..." : "Save and send me a test email"}
            </button>
          </div>
        </form>
      )}
      {note && <p role={note.ok ? "status" : "alert"} className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
    </SettingsCard>
  );
};

export default EmailSettings;
