import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";
import { money } from "../utils/format";
import { supplierOrderMessage } from "../utils/supplierOrder";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const LAST_SUPPLIER = "sandveld_quick_order_supplier"; // per computer: the supplier used last time

const remembered = () => { try { return localStorage.getItem(LAST_SUPPLIER) || ""; } catch { return ""; } };

// Quick order: pick the supplier, the products that are low or out are already ticked with an amount to order,
// change what you like, press Create. The order (a normal purchase order, priced at cost) opens ready to send to the
// supplier by WhatsApp or email with the list in the message - see `onCreated`.
const QuickOrder = ({ onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [supplierId, setSupplierId] = useState(remembered);
  const [lines, setLines] = useState([]); // [{ id, name, code, packaging, cost, stock_quantity, quantity }]
  const [search, setSearch] = useState("");
  const [needed, setNeeded] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState(null); // null = not touched: the business's delivery address is used
  const [lang, setLang] = useState("en");
  const [error, setError] = useState("");
  const seededFor = useRef(null);

  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await apiClient.get("/suppliers/")).data });
  const { data: business } = useQuery({ queryKey: ["business"], queryFn: async () => (await apiClient.get("/business/")).data });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: async () => (await apiClient.get("/products/")).data });
  const { data: suggestions, isFetching } = useQuery({
    queryKey: ["order-suggestions", supplierId],
    queryFn: async () => (await apiClient.get("/purchase-orders/suggestions", { params: { supplier_id: supplierId || undefined } })).data,
  });

  // Whenever another supplier is chosen, start again from what is low for them (what you typed is kept while you stay).
  useEffect(() => {
    if (!suggestions || isFetching || seededFor.current === supplierId) return;
    seededFor.current = supplierId;
    setLines(suggestions.map((s) => ({ ...s, quantity: String(s.suggested_quantity) })));
  }, [suggestions, isFetching, supplierId]);

  const chooseSupplier = (id) => {
    setSupplierId(id);
    try { localStorage.setItem(LAST_SUPPLIER, id); } catch { /* remembered until the app closes */ }
  };
  const supplier = suppliers.find((s) => String(s.id) === String(supplierId));
  const deliverTo = notes ?? (business?.physical_address ? `Deliver to: ${business.physical_address}` : "");
  const setQuantity = (id, quantity) => setLines((rows) => rows.map((r) => (r.id === id ? { ...r, quantity } : r)));
  const remove = (id) => setLines((rows) => rows.filter((r) => r.id !== id));

  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.is_active !== false && !lines.some((l) => l.id === p.id) && `${p.name} ${p.code || ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, lines, search]);
  const add = (p) => {
    setLines((rows) => [...rows, { id: p.id, name: p.name, code: p.code, packaging: p.packaging, cost: p.cost, stock_quantity: p.stock_quantity, quantity: "1" }]);
    setSearch("");
  };

  const valid = lines.filter((l) => Number(l.quantity) > 0);
  const estimate = valid.reduce((sum, l) => sum + (l.cost || 0) * Number(l.quantity), 0);

  const create = useMutation({
    mutationFn: async () => (await apiClient.post("/purchase-orders/quick", {
      supplier_id: Number(supplierId),
      lines: valid.map((l) => ({ product_id: l.id, quantity: Number(l.quantity) })),
      reference: reference || null,
      notes: deliverTo || null,
      delivery_date: needed ? `${needed}T00:00:00` : null,
    }, { silent: true })).data,
    onSuccess: ({ order, supplier: sup, lines: made }) => {
      ["purchase-orders", "products", "stock-overview", "order-suggestions"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      const message = supplierOrderMessage({ business, supplier: sup, po: order, lines: made, rep: { name: user?.name, phone: user?.phone }, lang });
      onCreated({
        kind: "purchase-order", id: order.id, title: order.number,
        hint: "Send it to the supplier - the order list is in the message. It is marked Sent once you do.",
        send: {
          phone: sup.phone, email: sup.email, subject: `Order ${order.number} from ${business?.trading_name || "us"}`, message,
          onSent: () => apiClient.post(`/purchase-orders/${order.id}/mark-sent`).then(() => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })),
        },
      });
      onClose();
    },
    onError: (err) => { const d = err?.response?.data?.detail; setError(typeof d === "string" ? d : "That order could not be made - check the amounts."); },
  });

  return (
    <Modal isOpen onClose={onClose} title="Quick order" size="xl">
      <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); setError(""); create.mutate(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block"><span className="text-xs text-slate-500">Order from</span>
            <select className={field} required value={supplierId} onChange={(e) => chooseSupplier(e.target.value)}>
              <option value="">Choose the supplier...</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className="block"><span className="text-xs text-slate-500">Needed by (optional)</span>
            <input className={field} type="date" value={needed} onChange={(e) => setNeeded(e.target.value)} /></label>
          <label className="block"><span className="text-xs text-slate-500">Reference (optional)</span>
            <input className={field} maxLength={200} placeholder="e.g. winter stock" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        </div>
        {suppliers.length === 0 && <p className="text-amber-700">Add a supplier first (the Suppliers button on this page).</p>}
        {supplier && !supplier.email && !supplier.phone && <p className="text-xs text-amber-700">{supplier.name} has no email or phone saved, so you will only be able to download the order.</p>}

        <section aria-label="What to order">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">What to order <span className="font-normal text-slate-400">{valid.length} {valid.length === 1 ? "product" : "products"}</span></h3>
            <span className="text-xs text-slate-500">{lines.length ? "Low and out-of-stock products are filled in for you." : ""}</span>
          </div>
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-slate-400">
              {supplierId ? "Nothing is low right now. Search below to add products." : "Choose a supplier to see what is low."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{l.name}{l.code && <span className="ml-2 text-xs font-normal text-slate-400">{l.code}</span>}</span>
                    <span className="block text-xs text-slate-500">
                      {[l.packaging, l.stock_quantity != null && `${l.stock_quantity} on the shelf`, l.cost != null ? `cost ${money(l.cost)}` : "no cost price saved"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <label className="flex items-center gap-2 text-xs text-slate-500">Order
                    <input type="number" min="0" step="any" aria-label={`Amount of ${l.name}`} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm text-slate-800"
                      value={l.quantity} onChange={(e) => setQuantity(l.id, e.target.value)} /></label>
                  <button type="button" onClick={() => remove(l.id)} aria-label={`Leave ${l.name} out`} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input className={`${field} pl-9`} placeholder="Add another product - type its name or code..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {found.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {found.map((p) => (
                  <li key={p.id}><button type="button" onClick={() => add(p)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50">
                    <span>{p.name}{p.code && <span className="ml-2 text-xs text-slate-400">{p.code}</span>}</span><Plus size={14} className="text-emerald-600" /></button></li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <label className="block"><span className="text-xs text-slate-500">Delivery details (printed on the order)</span>
          <textarea className={field} rows={2} maxLength={1000} value={deliverTo} onChange={(e) => setNotes(e.target.value)} /></label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="text-slate-600">
            {estimate > 0 && <>Estimated cost <b>{money(estimate)}</b> excl. VAT · </>}
            <span className="text-xs">message in
              <button type="button" className={`ml-1 ${lang === "en" ? "font-semibold text-emerald-700" : "text-slate-500 hover:underline"}`} onClick={() => setLang("en")}>English</button> /
              <button type="button" className={`ml-1 ${lang === "af" ? "font-semibold text-emerald-700" : "text-slate-500 hover:underline"}`} onClick={() => setLang("af")}>Afrikaans</button></span>
          </div>
          <button type="submit" disabled={!supplierId || valid.length === 0 || create.isPending}
            className="rounded-lg bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {create.isPending ? "Making the order..." : "Create order and send"}
          </button>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      </form>
    </Modal>
  );
};

export default QuickOrder;
