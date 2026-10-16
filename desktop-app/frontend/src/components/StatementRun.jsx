import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import apiClient from "../api/client";
import { money } from "../utils/format";

// Month-end: email every chosen client who owes money their statement of account in one go (the server writes each in
// the client's language, skips clients with no address, and tells you what happened - app/core/statement_mail.py).
const StatementRun = ({ debtors, period }) => {
  const { data: mail } = useQuery({ queryKey: ["mail-status"], queryFn: async () => (await apiClient.get("/mail/status")).data });
  const [picked, setPicked] = useState(null); // set of client ids; null = "everyone with an email address"
  const rows = debtors || [];
  useEffect(() => setPicked(null), [rows.length]);
  const selected = picked || new Set(rows.filter((r) => r.email).map((r) => r.client_id));
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const run = useMutation({
    mutationFn: async () => (await apiClient.post("/reports/statements/email", { client_ids: [...selected], start: period.start, end: period.end }, { silent: true })).data,
  });
  const send = () => {
    if (window.confirm(`Email a statement for ${period.start} to ${period.end} to ${selected.size} client${selected.size === 1 ? "" : "s"}?`)) run.mutate();
  };
  const result = run.data;
  const error = run.error?.response?.data?.detail?.toString?.() || (run.error ? "That didn't send." : "");

  if (!rows.length) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Email statements</h3>
          <p className="text-sm text-slate-500">Send everyone who owes money their statement of account, for the statement period above. Each is written in the client's language.</p>
        </div>
        <button type="button" onClick={send} disabled={!mail?.configured || run.isPending || selected.size === 0}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
          <Send size={16} /> {run.isPending ? "Sending..." : `Email ${selected.size} statement${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>
      {mail && !mail.configured && <p className="px-4 pt-3 text-sm text-amber-700">Email isn't set up yet. An admin can set it up under Settings → Email.</p>}
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.client_id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <input type="checkbox" checked={selected.has(r.client_id)} onChange={() => toggle(r.client_id)} disabled={!r.email}
              aria-label={`Include ${r.name}`} />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{r.name}</span>
            <span className="truncate text-slate-500">{r.email || "no email address"}</span>
            <span className="w-28 text-right tabular-nums text-slate-700">{money(r.total)}</span>
          </li>
        ))}
      </ul>
      {(result || error) && (
        <div role="status" className="space-y-1 border-t border-slate-100 p-4 text-sm">
          {error && <p role="alert" className="text-red-600">{error}</p>}
          {result && (
            <>
              <p className="text-emerald-700">Sent {result.sent.length} statement{result.sent.length === 1 ? "" : "s"}.</p>
              {result.skipped.length > 0 && <p className="text-slate-600">Skipped: {result.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.</p>}
              {result.failed.length > 0 && <p className="text-red-600">Could not send to: {result.failed.map((s) => `${s.name} (${s.reason})`).join(", ")}.</p>}
              {result.stopped && <p className="text-red-600">Stopped: {result.stopped} Not sent: {result.not_sent.map((s) => s.name).join(", ")}.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default StatementRun;
