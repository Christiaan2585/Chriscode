import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import apiClient from "../../api/client";
import SettingsCard from "./SettingsCard";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const BLANK = { host: "", port: 587, security: "starttls", username: "", password: "", from_address: "", from_name: "" };

// Settings -> Email (admins): the business's own mail server, so a statement, invoice or quote can be emailed straight
// from the app. The password is stored encrypted and is never shown again - leave it blank to keep the saved one.
const EmailSettings = () => {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["mail-settings"], queryFn: async () => (await apiClient.get("/mail/settings")).data });
  const [form, setForm] = useState(BLANK);
  const [testTo, setTestTo] = useState("");
  const [note, setNote] = useState(null);
  useEffect(() => { if (data) setForm({ ...BLANK, ...data, username: data.username || "", from_name: data.from_name || "", password: "" }); }, [data]);

  const say = (ok, text) => setNote({ ok, text });
  const detail = (err) => err?.response?.data?.detail?.toString?.() || "That didn't work.";
  const save = useMutation({
    mutationFn: () => apiClient.put("/mail/settings", { ...form, port: Number(form.port), password: form.password || null }, { silent: true }),
    onSuccess: () => { say(true, "Saved."); queryClient.invalidateQueries({ queryKey: ["mail-settings"] }); queryClient.invalidateQueries({ queryKey: ["mail-status"] }); },
    onError: (err) => say(false, Array.isArray(err?.response?.data?.detail) ? "Check the details: the server name, port and from address must be filled in properly." : detail(err)),
  });
  const test = useMutation({
    mutationFn: () => apiClient.post("/mail/test", { to: testTo }, { silent: true }),
    onSuccess: () => say(true, `A test email was sent to ${testTo}.`),
    onError: (err) => say(false, detail(err)),
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const useSecurity = (security) => setForm({ ...form, security, port: security === "ssl" ? 465 : 587 });

  return (
    <SettingsCard icon={Mail} title="Email">
      <p className="text-sm text-slate-600">
        Use your own email account (the details are in your email provider's help pages under "SMTP"). Then a statement,
        invoice or quote can be emailed from the app with one click. Documents go straight from this computer to your mail server.
      </p>
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="sm:col-span-2"><span className="text-xs text-slate-500">Mail server</span>
          <input className={field} required placeholder="smtp.example.com" value={form.host} onChange={set("host")} /></label>
        <label><span className="text-xs text-slate-500">Security</span>
          <select className={field} value={form.security} onChange={(e) => useSecurity(e.target.value)}>
            <option value="starttls">STARTTLS (usually port 587)</option>
            <option value="ssl">SSL/TLS (usually port 465)</option>
          </select></label>
        <label><span className="text-xs text-slate-500">Port</span>
          <input className={field} type="number" min="1" max="65535" required value={form.port} onChange={set("port")} /></label>
        <label><span className="text-xs text-slate-500">User name</span>
          <input className={field} autoComplete="off" value={form.username} onChange={set("username")} /></label>
        <label><span className="text-xs text-slate-500">Password {data?.has_password && "(saved - leave blank to keep it)"}</span>
          <input className={field} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} /></label>
        <label><span className="text-xs text-slate-500">Send from (email address)</span>
          <input className={field} type="email" required value={form.from_address} onChange={set("from_address")} /></label>
        <label><span className="text-xs text-slate-500">Name shown to the client</span>
          <input className={field} maxLength={100} placeholder="Sandveld Vee Dienste" value={form.from_name} onChange={set("from_name")} /></label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Save</button>
        </div>
      </form>
      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <label className="min-w-0 flex-1"><span className="text-xs text-slate-500">Send a test email to</span>
          <input className={field} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></label>
        <button type="button" disabled={!testTo || test.isPending || !data?.host} onClick={() => test.mutate()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Send test</button>
      </div>
      {note && <p role={note.ok ? "status" : "alert"} className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
    </SettingsCard>
  );
};

export default EmailSettings;
