import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { money, shortDate } from "../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const input = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";

// Everything that changes when money is recorded: the invoice lists, balances, client pages and the dashboard.
export const refreshMoney = (queryClient) =>
  ["invoices", "invoice-balances", "invoice-settlement", "client-summary", "analytics", "aged-debtors"].forEach((key) =>
    queryClient.invalidateQueries({ queryKey: [key] }));

// An invoice's payments and credit notes, its balance, and the forms to add either (app/api/payments.py).
const InvoicePayments = ({ invoice, onClose, onPreview }) => {
  const queryClient = useQueryClient();
  const key = ["invoice-settlement", invoice.id];
  const { data } = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get(`/invoices/${invoice.id}/payments`)).data });
  const [pay, setPay] = useState({ amount: "", date: today(), method: "EFT", reference: "" });
  const [credit, setCredit] = useState({ amount: "", reason: "" });
  const [error, setError] = useState("");
  const done = () => { setError(""); refreshMoney(queryClient); };
  const fail = (err) => setError(err?.response?.data?.detail?.toString?.() || "That didn't save.");

  const record = useMutation({
    mutationFn: () => apiClient.post(`/invoices/${invoice.id}/payments`, { ...pay, amount: Number(pay.amount || data?.balance) }, { silent: true }),
    onSuccess: () => { setPay({ amount: "", date: today(), method: "EFT", reference: "" }); done(); },
    onError: fail,
  });
  const issue = useMutation({
    mutationFn: () => apiClient.post(`/invoices/${invoice.id}/credit-notes`, { amount: Number(credit.amount), reason: credit.reason }, { silent: true }),
    onSuccess: () => { setCredit({ amount: "", reason: "" }); done(); },
    onError: fail,
  });
  const remove = useMutation({ mutationFn: (url) => apiClient.delete(url, { silent: true }), onSuccess: done, onError: fail });

  const cancelled = invoice.status === "cancelled";
  const owed = data?.balance ?? 0;
  return (
    <Modal isOpen onClose={onClose} size="lg" title={`Payments - ${invoice.number || `#${invoice.id}`}`}>
      <div className="space-y-5 text-sm">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Invoice total", data?.total], ["Paid", data?.paid], ["Credited", data?.credited], [owed < 0 ? "Client is owed" : "Still owed", Math.abs(owed)]].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-base font-semibold text-slate-800">{value === undefined ? "..." : money(value)}</dd>
            </div>
          ))}
        </dl>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}

        <section>
          <h3 className="mb-2 font-semibold text-slate-800">Payments received</h3>
          {data?.payments?.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>{shortDate(p.date)} - {p.method}{p.reference ? ` - ${p.reference}` : ""}</span>
                  <span className="flex items-center gap-2 font-medium">{money(p.amount)}
                    <button type="button" data-admin-only title="Remove payment" className="p-1 text-slate-400 hover:text-red-600"
                      onClick={() => window.confirm("Remove this payment?") && remove.mutate(`/payments/${p.id}`)}><Trash2 size={14} /></button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-500">No payments yet.</p>}
          {!cancelled && owed > 0 && (
            <form className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); record.mutate(); }}>
              <label className="sm:col-span-1"><span className="text-xs text-slate-500">Amount (R)</span>
                <input className={input} type="number" min="0.01" step="0.01" placeholder={owed.toFixed(2)} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
              <label><span className="text-xs text-slate-500">Date</span>
                <input className={input} type="date" required value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></label>
              <label><span className="text-xs text-slate-500">How</span>
                <select className={input} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  {["EFT", "Cash", "Card", "Other"].map((m) => <option key={m}>{m}</option>)}
                </select></label>
              <label><span className="text-xs text-slate-500">Reference</span>
                <input className={input} maxLength={120} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></label>
              <button type="submit" disabled={record.isPending} className="self-end rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                Record payment
              </button>
            </form>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold text-slate-800">Credit notes</h3>
          {data?.credit_notes?.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.credit_notes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span><b>{c.number}</b> - {shortDate(c.date)} - {c.reason}</span>
                  <span className="flex items-center gap-2 font-medium">{money(c.amount)}
                    <button type="button" title="Preview" className="p-1 text-slate-400 hover:text-emerald-600"
                      onClick={() => onPreview({ kind: "credit-note", id: c.id, title: c.number })}><Eye size={14} /></button>
                    <button type="button" data-admin-only title="Remove credit note" className="p-1 text-slate-400 hover:text-red-600"
                      onClick={() => window.confirm(`Remove credit note ${c.number}?`) && remove.mutate(`/credit-notes/${c.id}`)}><Trash2 size={14} /></button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-500">No credit notes.</p>}
          {!cancelled && (
            <form className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); issue.mutate(); }}>
              <label><span className="text-xs text-slate-500">Amount incl. VAT (R)</span>
                <input className={input} type="number" min="0.01" step="0.01" required value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} /></label>
              <label className="sm:col-span-3"><span className="text-xs text-slate-500">Reason</span>
                <input className={input} required maxLength={500} placeholder="e.g. 2 bottles returned damaged" value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} /></label>
              <button type="submit" disabled={issue.isPending} className="self-end rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Issue credit note
              </button>
            </form>
          )}
        </section>
      </div>
    </Modal>
  );
};

export default InvoicePayments;
