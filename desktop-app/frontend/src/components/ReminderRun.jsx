import { t } from "../utils/i18n";
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Send } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { money, shortDate } from "../utils/format";

// "Remind all overdue": every overdue invoice with what is owed; tick who gets a reminder and send them in one go. Each goes
// as its own email with the invoice attached, written in the client's language (app/core/reminder_mail.py). Clients with no
// email address can't be ticked - use the bell on the invoice to send those by WhatsApp.
const ReminderRun = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { data: mail } = useQuery({ queryKey: ["mail-status"], queryFn: async () => (await apiClient.get("/mail/status")).data, enabled: isOpen });
  const { data: rows, isLoading } = useQuery({
    queryKey: ["reminders", "overdue"],
    queryFn: async () => (await apiClient.get("/reports/reminders/overdue")).data,
    enabled: isOpen,
    staleTime: 0,
  });
  const [picked, setPicked] = useState(null); // null = everyone with an email address
  useEffect(() => { if (!isOpen) setPicked(null); }, [isOpen]);
  const list = rows || [];
  const selected = picked || new Set(list.filter((r) => r.email).map((r) => r.invoice_id));
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const run = useMutation({
    mutationFn: async () => (await apiClient.post("/reports/reminders/email", { invoice_ids: [...selected] }, { silent: true })).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sends", "reminder"] }); queryClient.invalidateQueries({ queryKey: ["reminders"] }); },
  });
  const send = () => {
    if (window.confirm(`Email a payment reminder for ${selected.size} invoice${selected.size === 1 ? "" : "s"}?`)) run.mutate();
  };
  const result = run.data;
  const error = run.error?.response?.data?.detail?.toString?.() || (run.error ? "That didn't send." : "");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Remind all overdue")} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">{t("Send a friendly payment reminder, with the invoice attached, for every overdue invoice you tick. Each is written in the client's language.")}</p>
        {mail && !mail.configured && <p className="text-amber-700">{t("Email isn't set up yet. An admin can set it up under Settings → Email.")}</p>}
        {isLoading ? <p className="text-slate-400">{t("Loading…")}</p>
          : list.length === 0 ? <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{t("Nothing is overdue. Well done!")}</p>
          : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {list.map((r) => (
                <li key={r.invoice_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <input type="checkbox" checked={selected.has(r.invoice_id)} onChange={() => toggle(r.invoice_id)} disabled={!r.email} aria-label={`Include ${r.number}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{r.client} · {r.number}</span>
                    <span className="block truncate text-xs text-slate-500">{r.email || "no email address"} · {r.days_overdue} {r.days_overdue === 1 ? "day" : "days"} overdue (due {shortDate(r.due)})</span>
                  </span>
                  <span className="tabular-nums text-slate-700">{money(r.owed)}</span>
                </li>
              ))}
            </ul>
          )}
        {(result || error) && (
          <div role="status" className="space-y-1">
            {error && <p role="alert" className="text-red-600">{error}</p>}
            {result && (
              <>
                <p className="text-emerald-700">Sent {result.sent.length} reminder{result.sent.length === 1 ? "" : "s"}.</p>
                {result.skipped.length > 0 && <p className="text-slate-600">Skipped: {result.skipped.map((s) => `${s.number} (${s.reason})`).join(", ")}.</p>}
                {result.failed.length > 0 && <p className="text-red-600">Could not send: {result.failed.map((s) => `${s.number} (${s.reason})`).join(", ")}.</p>}
                {result.stopped && <p className="text-red-600">Stopped: {result.stopped} Not sent: {result.not_sent.map((s) => s.number).join(", ")}.</p>}
              </>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">{t("Close")}</button>
          <button type="button" onClick={send} disabled={!mail?.configured || run.isPending || selected.size === 0}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <Send size={16} /> {run.isPending ? "Sending..." : `Email ${selected.size} reminder${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export const RemindAllButton = ({ onClick, className = "" }) => (
  <button type="button" onClick={onClick}
    className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-amber-400 hover:text-amber-700 ${className}`}>
    <BellRing size={16} /> {t("Remind all overdue")}
  </button>
);

export default ReminderRun;
