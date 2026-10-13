import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ClipboardCheck, History, Search, SlidersHorizontal } from "lucide-react";
import apiClient from "../api/client";
import InlineEdit from "./InlineEdit";
import Modal from "./Modal";
import { describeMovement, groupByDay, statusLabel } from "../utils/stockTimeline";
import { shortDate } from "../utils/format";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const BADGE = { ok: "bg-emerald-100 text-emerald-700", low: "bg-amber-100 text-amber-800", out: "bg-red-100 text-red-700", untracked: "bg-slate-100 text-slate-600" };
const KINDS = [["", "Everything"], ["sold", "Sold"], ["received", "Received"], ["count", "Counted"], ["adjusted", "Adjusted"]];
const num = (n) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));
const signed = (n) => `${n > 0 ? "+" : ""}${num(n)}`;
const time = (iso) => new Date(`${String(iso).replace(/Z$/, "")}Z`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// A manual correction: breakage, expiry, a sample given away, a box found. Needs a reason, shown in the timeline.
const AdjustDialog = ({ product, onClose, onDone }) => {
  const [change, setChange] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => apiClient.post(`/stock/${product.id}/adjust`, { change: Number(change), note }, { silent: true }),
    onSuccess: () => { onDone(); onClose(); },
    onError: (err) => { const d = err?.response?.data?.detail; setError(typeof d === "string" ? d : "Enter a number (use - for less) and a reason."); },
  });
  const after = change === "" || Number.isNaN(Number(change)) ? null : product.stock_quantity + Number(change);
  return (
    <Modal isOpen onClose={onClose} title={`Adjust ${product.name}`} size="md">
      <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <p className="text-slate-600">On the shelf now: <b>{num(product.stock_quantity)}</b>{after !== null && <> - after this: <b>{num(after)}</b></>}</p>
        <label className="block"><span className="text-xs text-slate-500">Change (use - to take stock off, e.g. -3)</span>
          <input className={field} type="number" step="any" required value={change} onChange={(e) => setChange(e.target.value)} /></label>
        <label className="block"><span className="text-xs text-slate-500">Reason</span>
          <input className={field} required maxLength={200} placeholder="e.g. two bottles broken" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <button type="submit" disabled={save.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Save adjustment</button>
      </form>
    </Modal>
  );
};

// The Stock tab on the Purchase Orders page: what is on the shelf, and a timeline of every movement. Invoices take
// stock off and received purchase orders add to it by themselves (app/core/stock.py); counting and adjusting is here.
const StockPanel = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [productId, setProductId] = useState("");
  const [kind, setKind] = useState("");
  const [adjusting, setAdjusting] = useState(null);

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["stock-overview"], queryFn: async () => (await apiClient.get("/stock/")).data });
  const movementsKey = ["stock-movements", productId, kind];
  const { data: movements = [] } = useQuery({
    queryKey: movementsKey,
    queryFn: async () => (await apiClient.get("/stock/movements", { params: { product_id: productId || undefined, reason: kind || undefined, limit: 300 } })).data,
  });
  const refresh = () => ["stock-overview", "stock-movements", "products", "analytics"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

  const count = useMutation({ mutationFn: ({ id, quantity }) => apiClient.post(`/products/${id}/stock-count`, { quantity }), onSuccess: refresh });
  const reorder = useMutation({ mutationFn: ({ id, level }) => apiClient.patch(`/products/${id}`, { reorder_level: level }), onSuccess: refresh });

  const tally = useMemo(() => ({
    low: rows.filter((r) => r.status === "low").length,
    out: rows.filter((r) => r.status === "out").length,
    counted: rows.filter((r) => r.status !== "untracked").length,
  }), [rows]);
  const shown = rows.filter((r) => (!status || r.status === status) && (!search.trim() || `${r.name} ${r.code || ""} ${r.category || ""}`.toLowerCase().includes(search.trim().toLowerCase())));
  const days = groupByDay(movements);
  const focused = rows.find((r) => String(r.id) === String(productId));

  const tile = (label, value, filter, tone) => (
    <button type="button" onClick={() => setStatus(status === filter ? "" : filter)} aria-pressed={status === filter}
      className={`rounded-xl border p-3 text-left shadow-sm transition-colors ${status === filter ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200 hover:border-emerald-300"} bg-white`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
    </button>
  );

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
        <b>Automatic:</b> every invoice takes its products off the shelf, and a purchase order adds them when you mark it <b>Received</b>.
        Edit, cancel or delete either one and the stock corrects itself. Count a product once to start keeping track of it.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile("Products counted", `${tally.counted} / ${rows.length}`, "", "text-slate-800")}
        {tile("Low", tally.low, "low", tally.low ? "text-amber-600" : "text-slate-800")}
        {tile("Out of stock", tally.out, "out", tally.out ? "text-red-600" : "text-slate-800")}
        {tile("Not counted yet", rows.length - tally.counted, "untracked", "text-slate-800")}
      </div>

      <section aria-label="Stock on the shelf" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className={`${field} pl-10`} placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={`${field} w-auto`} aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All products</option><option value="low">Low</option><option value="out">Out of stock</option><option value="untracked">Not counted yet</option><option value="ok">OK</option>
          </select>
        </div>
        <div className="relative overflow-x-auto">
          <table className="card-table w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 text-right font-medium">On the shelf</th>
                <th className="px-4 py-3 text-right font-medium">Reorder at</th><th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last change</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>}
              {shown.map((r) => (
                <tr key={r.id}>
                  <td data-primary className="px-4 py-3 font-medium text-slate-800">{r.name}{r.code && <span className="ml-2 text-xs font-normal text-slate-400">{r.code}</span>}</td>
                  <td data-label="On the shelf" className="px-4 py-3 text-right text-slate-700">
                    <InlineEdit value={r.stock_quantity} type="number" label="Count - what is on the shelf now" placeholder="Count it"
                      onSave={(v) => count.mutateAsync({ id: r.id, quantity: v ?? 0 })} format={num} />
                  </td>
                  <td data-label="Reorder at" className="px-4 py-3 text-right text-slate-500">
                    <InlineEdit value={r.reorder_level} type="number" label="Reorder level" placeholder="—" onSave={(v) => reorder.mutateAsync({ id: r.id, level: v })} format={num} />
                  </td>
                  <td data-label="Status" className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.status]}`}>{statusLabel(r.status)}</span></td>
                  <td data-label="Last change" className="px-4 py-3 text-slate-500">{r.last_movement ? shortDate(r.last_movement) : "—"}</td>
                  <td data-actions className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" disabled={r.stock_quantity === null} onClick={() => setAdjusting(r)} title={r.stock_quantity === null ? "Count it first" : "Adjust: breakage, expiry, samples..."}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-400 disabled:opacity-40"><SlidersHorizontal size={14} /> Adjust</button>
                      <button type="button" onClick={() => { setProductId(String(r.id)); setKind(""); document.getElementById("stock-timeline")?.scrollIntoView({ behavior: "smooth" }); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-400"><History size={14} /> History</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No products match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section id="stock-timeline" aria-label="Stock timeline" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><ClipboardCheck size={18} className="text-emerald-600" /> Timeline{focused ? ` - ${focused.name}` : ""}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${field} w-auto`} aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">All products</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div role="group" aria-label="Kind of change" className="flex flex-wrap gap-1">
              {KINDS.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${kind === value ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-emerald-300"}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        {days.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nothing recorded yet. Count a product, then sell it or receive an order and it shows up here.</p>
        ) : days.map((group) => (
          <div key={group.day}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{shortDate(group.day)}</h4>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {group.rows.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.change > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`} aria-hidden="true">
                    {m.change > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{m.product_name}</span>
                    <span className="block truncate text-xs text-slate-500">{describeMovement(m)} · {time(m.at)} · {m.by || "automatic"}</span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-semibold ${m.change > 0 ? "text-emerald-700" : "text-red-700"}`}>{signed(m.change)}</span>
                    <span className="block text-xs text-slate-400">{m.balance === null || m.balance === undefined ? "" : `${num(m.balance)} left`}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {adjusting && <AdjustDialog product={adjusting} onClose={() => setAdjusting(null)} onDone={refresh} />}
    </div>
  );
};

export default StockPanel;
