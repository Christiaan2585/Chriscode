import React, { useState } from "react";
import { BulkBar, SelectAllTh, SelectTd } from "../components/BulkSelect";
import { useSelection } from "../utils/useSelection";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Edit, Eye, Download, X, Truck, Building2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "../components/Modal";
import SearchableSelect from "../components/SearchableSelect";
import DocumentPreview from "../components/DocumentPreview";
import { downloadDocumentPdf, lineTotal } from "../utils/documents";
import { money, newestFirst, shortDate, statusStyle } from "../utils/format";
import { pickerProducts } from "../utils/products";

const STATUSES = ["Draft", "Sent", "Received", "Cancelled"];
const emptyOrder = { supplier_id: "", status: "Draft", reference: "", delivery_date: "", notes: "" };
const emptyLine = { product_id: "", description: "", quantity: 1, unit_price: "", discount_percent: "" };
const emptySupplier = { name: "", vat_number: "", address: "", contact_person: "", phone: "", email: "" };
const inputClass = "w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none";
const toDateInput = (d) => (d ? String(d).slice(0, 10) : "");

const Label = ({ children }) => <span className="mb-1 block text-sm font-medium text-slate-700">{children}</span>;

const SuppliersModal = ({ isOpen, onClose, suppliers }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptySupplier);
  const [editingId, setEditingId] = useState(null);
  const reset = () => {
    setForm(emptySupplier);
    setEditingId(null);
  };
  const save = useMutation({
    mutationFn: async () =>
      editingId ? apiClient.put(`/suppliers/${editingId}`, form) : apiClient.post("/suppliers/", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      reset();
    },
  });
  const remove = useMutation({
    mutationFn: async (id) => apiClient.delete(`/suppliers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} title="Suppliers" size="lg">
      <div className="space-y-5">
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
              <div>
                <div className="font-medium text-slate-700">{s.name}</div>
                <div className="text-xs text-slate-500">{[s.contact_person, s.phone, s.email].filter(Boolean).join(" • ") || "No contact details"}</div>
              </div>
              <div className="flex gap-1">
                <button type="button" title="Edit" onClick={() => { setEditingId(s.id); setForm({ ...emptySupplier, ...s }); }}
                  className="p-1.5 text-slate-400 hover:text-emerald-600"><Edit size={16} /></button>
                <button type="button" title="Delete" onClick={() => window.confirm(`Delete ${s.name}?`) && remove.mutate(s.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
          {suppliers.length === 0 && <li className="py-2 text-center text-sm text-slate-400">No suppliers yet.</li>}
        </ul>

        <form className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <h4 className="text-sm font-semibold text-slate-800">{editingId ? "Edit supplier" : "Add a supplier"}</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[["name", "Name"], ["vat_number", "VAT number"], ["contact_person", "Contact person"], ["phone", "Phone"], ["email", "Email"]].map(([key, label]) => (
              <label key={key}><Label>{label}</Label>
                <input className={inputClass} value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === "name"} />
              </label>
            ))}
            <label className="col-span-2"><Label>Address</Label>
              <textarea rows={3} className={inputClass} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {editingId && <button type="button" onClick={reset} className="px-4 py-2 text-sm text-slate-600">Cancel</button>}
            <button type="submit" disabled={!form.name || save.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {editingId ? "Save supplier" : "Add supplier"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

const PurchaseOrders = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = closed, "new", or an order
  const [order, setOrder] = useState(emptyOrder);
  const [existingLines, setExistingLines] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [newLines, setNewLines] = useState([]);
  const [line, setLine] = useState(emptyLine);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => (await apiClient.get("/purchase-orders/")).data,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await apiClient.get("/suppliers/")).data,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await apiClient.get("/products/")).data,
  });
  const supplierName = (id) => suppliers.find((s) => s.id === Number(id))?.name || `Supplier #${id}`;

  const filtered = (orders || [])
    .filter((o) => {
      const q = search.trim().toLowerCase();
      return !q || [o.number, o.reference, o.status, supplierName(o.supplier_id)].some((v) => v?.toLowerCase().includes(q));
    })
    .sort(newestFirst);
  const selection = useSelection((filtered).map((r) => r.id));

  const openNew = () => {
    setEditing("new");
    setOrder(emptyOrder);
    setExistingLines([]);
    setRemovedIds([]);
    setNewLines([]);
    setLine(emptyLine);
  };
  const openEdit = async (o) => {
    setOrder({ supplier_id: o.supplier_id, status: o.status, reference: o.reference || "",
      delivery_date: toDateInput(o.delivery_date), notes: o.notes || "" });
    setRemovedIds([]);
    setNewLines([]);
    setLine(emptyLine);
    setExistingLines((await apiClient.get(`/purchase-orders/${o.id}/items`)).data);
    setEditing(o);
  };
  const close = () => setEditing(null);

  const addLine = () => {
    if (!line.product_id && !line.description.trim()) return;
    setNewLines([...newLines, { ...line, _key: Date.now() }]);
    setLine(emptyLine);
  };

  const save = useMutation({
    mutationFn: async () => {
      const fields = { ...order, supplier_id: Number(order.supplier_id), reference: order.reference || null,
        delivery_date: order.delivery_date || null, notes: order.notes || null };
      const id = editing === "new"
        ? (await apiClient.post("/purchase-orders/", fields)).data.id
        : (await apiClient.put(`/purchase-orders/${editing.id}`, fields)).data.id;
      for (const itemId of removedIds) await apiClient.delete(`/purchase-orders/items/${itemId}`);
      for (const l of newLines) {
        await apiClient.post(`/purchase-orders/${id}/items`, {
          purchase_order_id: id,
          product_id: l.product_id ? Number(l.product_id) : null,
          description: l.description,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price) || 0, // 0 = the product's cost price
          discount_percent: Number(l.discount_percent) || 0,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      close();
    },
  });

  const remove = useMutation({
    mutationFn: async (id) => apiClient.delete(`/purchase-orders/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  const lineCount = existingLines.filter((l) => !removedIds.includes(l.id)).length + newLines.length;

  if (isLoading) return <div className="p-8 text-center">Loading purchase orders...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Purchase Orders</h2>
          <p className="text-slate-500">Order stock from suppliers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSuppliersOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:border-emerald-400">
            <Building2 size={18} /> Suppliers
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-emerald-700">
            <Plus size={20} /> New Purchase Order
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by number, supplier, reference or status..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <div className="space-y-2 p-3 empty:hidden">
          <BulkBar selection={selection} noun="purchase order" describe={(id) => orders?.find((r) => r.id === id)?.number || `#${id}`}
            deleteOne={(id) => apiClient.delete(`/purchase-orders/${id}`, { silent: true })}
            onDone={() => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })} />
        </div>
        <div className="relative overflow-x-auto">
        <table className="card-table w-full text-left">
          <thead className="bg-slate-50 text-sm uppercase text-slate-500">
            <tr>
              <SelectAllTh selection={selection} />
              {["Number", "Date", "Supplier", "Delivery", "Total", "Status"].map((h) => <th key={h} className="px-6 py-3 font-medium">{h}</th>)}
              <th className="px-6 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-slate-50">
                <SelectTd selection={selection} id={o.id} label={`Select ${((id) => orders?.find((r) => r.id === id)?.number || `#${id}`)(o.id)}`} />
                <td data-primary className="px-6 py-4 font-medium text-slate-600">{o.number || `#${o.id}`}</td>
                <td data-label="Date" className="px-6 py-4 text-slate-600">{shortDate(o.date)}</td>
                <td data-label="Supplier" className="px-6 py-4 text-slate-600">{supplierName(o.supplier_id)}</td>
                <td data-label="Delivery" className="px-6 py-4 text-slate-600">{shortDate(o.delivery_date)}</td>
                <td data-label="Total" className="px-6 py-4 font-medium text-slate-800">{money(o.total_amount)}</td>
                <td data-label="Status" className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusStyle(o.status)}`}>{o.status}</span></td>
                <td data-actions className="flex justify-end gap-2 px-6 py-4 text-right">
                  <button title="Preview" onClick={() => setPreview({ kind: "purchase-order", id: o.id, title: o.number })}
                    className="p-2 text-slate-400 transition-colors hover:text-emerald-600"><Eye size={18} /></button>
                  <button title="Download PDF" onClick={() => downloadDocumentPdf("purchase-order", o.id, o.number)}
                    className="p-2 text-slate-400 transition-colors hover:text-emerald-600"><Download size={18} /></button>
                  <button title="Edit" onClick={() => openEdit(o)}
                    className="p-2 text-slate-400 transition-colors hover:text-emerald-600"><Edit size={18} /></button>
                  <button title="Delete" onClick={() => window.confirm(`Delete ${o.number || "this order"}? This can't be undone.`) && remove.mutate(o.id)}
                    className="p-2 text-slate-400 transition-colors hover:text-red-600"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                {orders?.length ? "No purchase orders match your search." : "No purchase orders yet. Add a supplier, then create your first order."}
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Modal isOpen={editing !== null} onClose={close} size="lg"
        title={editing === "new" ? "New Purchase Order" : `Edit ${editing?.number || "Purchase Order"}`}>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Supplier</Label>
              <SearchableSelect value={order.supplier_id} onChange={(v) => setOrder({ ...order, supplier_id: v })}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder="Select a supplier…" searchPlaceholder="Search suppliers…" />
              {suppliers.length === 0 && (
                <button type="button" onClick={() => setSuppliersOpen(true)} className="mt-1 text-xs font-medium text-emerald-600">+ Add a supplier first</button>
              )}
            </div>
            <label><Label>Status</Label>
              <select className={inputClass} value={order.status} onChange={(e) => setOrder({ ...order, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label><Label>Reference</Label>
              <input className={inputClass} value={order.reference} onChange={(e) => setOrder({ ...order, reference: e.target.value })} placeholder="e.g. who it's for" />
            </label>
            <label><Label>Delivery date</Label>
              <input type="date" className={inputClass} value={order.delivery_date} onChange={(e) => setOrder({ ...order, delivery_date: e.target.value })} />
            </label>
          </div>
          <label className="block"><Label>Notes (printed on the order, e.g. delivery address)</Label>
            <textarea rows={3} className={inputClass} value={order.notes} onChange={(e) => setOrder({ ...order, notes: e.target.value })} />
          </label>

          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-semibold text-slate-800"><Truck size={18} /> Order lines</h4>
            <p className="text-xs text-slate-500">Pick a product (priced at its cost price unless you type one), or type a description for anything else.</p>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_5.5rem_4.5rem_2.75rem] gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <SearchableSelect value={line.product_id} onChange={(v) => setLine({ ...line, product_id: v })}
                options={pickerProducts(products, line.product_id).map((p) => ({ value: p.id, label: p.code ? `${p.code} - ${p.name}` : p.name }))}
                placeholder="Product…" searchPlaceholder="Search products…" />
              <input className="rounded-lg border border-slate-200 p-2 text-sm" placeholder={line.product_id ? "Description (optional)" : "Description"}
                value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} aria-label="Description" />
              <input type="number" min="0" className="rounded-lg border border-slate-200 p-2 text-sm" value={line.quantity}
                onChange={(e) => setLine({ ...line, quantity: e.target.value })} aria-label="Quantity" />
              <input type="number" min="0" step="0.01" className="rounded-lg border border-slate-200 p-2 text-sm" placeholder="Price"
                value={line.unit_price} onChange={(e) => setLine({ ...line, unit_price: e.target.value })} aria-label="Unit price (blank for cost price)" />
              <input type="number" min="0" max="100" step="0.01" className="rounded-lg border border-slate-200 p-2 text-sm" placeholder="Disc %"
                value={line.discount_percent} onChange={(e) => setLine({ ...line, discount_percent: e.target.value })} aria-label="Discount percent" />
              <button type="button" onClick={addLine} title="Add line" className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700">
                <Plus size={18} className="mx-auto" />
              </button>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {existingLines.map((l) => {
                const removed = removedIds.includes(l.id);
                return (
                  <li key={l.id} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${removed ? "border-red-100 bg-red-50 opacity-60" : "border-slate-100"}`}>
                    <span className={removed ? "line-through" : ""}>{l.description} — {l.quantity} × {money(l.unit_price)}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-bold">{money(l.subtotal)}</span>
                      {removed ? (
                        <button type="button" onClick={() => setRemovedIds(removedIds.filter((i) => i !== l.id))} className="text-xs font-medium text-emerald-600">Undo</button>
                      ) : (
                        <button type="button" onClick={() => setRemovedIds([...removedIds, l.id])} className="text-red-400 hover:text-red-600" title="Remove"><X size={16} /></button>
                      )}
                    </span>
                  </li>
                );
              })}
              {newLines.map((l) => {
                const product = products.find((p) => p.id === Number(l.product_id));
                const price = Number(l.unit_price) || product?.cost || product?.price || 0;
                return (
                  <li key={l._key} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-sm">
                    <span>{l.description || product?.name} — {l.quantity} × {money(price)}{Number(l.discount_percent) ? `, ${l.discount_percent}% off` : ""} <em className="text-xs not-italic text-emerald-600">(new)</em></span>
                    <span className="flex items-center gap-3">
                      <span className="font-bold">{money(lineTotal(l.quantity, price, l.discount_percent))}</span>
                      <button type="button" onClick={() => setNewLines(newLines.filter((n) => n._key !== l._key))} className="text-red-400 hover:text-red-600" title="Remove"><X size={16} /></button>
                    </span>
                  </li>
                );
              })}
              {lineCount === 0 && <li className="py-2 text-center text-sm text-slate-400">No lines added yet.</li>}
            </ul>
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-4">
            <button type="button" onClick={() => save.mutate()} disabled={!order.supplier_id || lineCount === 0 || save.isPending}
              className="rounded-lg bg-emerald-600 px-6 py-2 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {save.isPending ? "Saving..." : editing === "new" ? "Create Purchase Order" : "Save Changes"}
            </button>
          </div>
        </div>
      </Modal>

      <SuppliersModal isOpen={suppliersOpen} onClose={() => setSuppliersOpen(false)} suppliers={suppliers} />
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
};

export default PurchaseOrders;
