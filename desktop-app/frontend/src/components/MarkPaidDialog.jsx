import { t } from "../utils/i18n";
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import Modal from "./Modal";
import { refreshMoney } from "./InvoicePayments";
import { money } from "../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const input = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";

// "Mark as paid": the whole amount still owing is filled in (change it for a part payment), pick how it was paid and
// press one button. The full payments screen (wallet button) stays for credit notes and corrections.
const MarkPaidDialog = ({ invoice, balance, onClose }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ amount: String(balance), date: today(), method: "EFT", reference: "" });
  const pay = useMutation({
    mutationFn: (override) => apiClient.post(`/invoices/${invoice.id}/payments`, { ...form, amount: Number(form.amount), ...override }, { silent: true }),
    onSuccess: () => { refreshMoney(queryClient); onClose(); },
  });
  const error = pay.error?.response?.data?.detail?.toString?.() || (pay.error ? "That didn't save." : "");
  const valid = Number(form.amount) > 0 && Number(form.amount) <= balance + 0.001;

  return (
    <Modal isOpen onClose={onClose} title={`Mark ${invoice.number || `#${invoice.id}`} as paid`} size="md">
      <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); pay.mutate(); }}>
        <p className="text-slate-600">{money(balance)} is still owing. Change the amount below if only part was paid.</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Paid in full today")}>
          {["EFT", "Cash"].map((method) => (
            <button key={method} type="button" disabled={pay.isPending}
              onClick={() => pay.mutate({ amount: balance, date: today(), method })}
              className="min-h-11 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
              {method === "Cash" ? t("Paid in full - cash") : t("Paid in full - EFT")}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-slate-400">{t("or fill in the details below")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-xs text-slate-500">{t("Amount paid (R)")}</span>
            <input className={input} type="number" step="0.01" min="0.01" max={balance} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoFocus /></label>
          <label className="block"><span className="text-xs text-slate-500">{t("Date paid")}</span>
            <input className={input} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-slate-500">{t("How")}</span>
            <select className={input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option>EFT</option><option>{t("Cash")}</option><option>{t("Card")}</option><option>{t("Other")}</option>
            </select></label>
          <label className="block"><span className="text-xs text-slate-500">{t("Reference (optional)")}</span>
            <input className={input} maxLength={120} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <button type="submit" disabled={pay.isPending || !valid} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {pay.isPending ? "Saving..." : Number(form.amount) >= balance - 0.001 ? "Mark as paid in full" : "Record this payment"}
        </button>
      </form>
    </Modal>
  );
};

export default MarkPaidDialog;
