import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, FileText, Trash2, Download, X, Edit } from "lucide-react";
import apiClient from "../api/client";
import { clientService } from "../api/services";
import Modal from "../components/Modal";
import SearchableSelect from "../components/SearchableSelect";

const emptyInvoice = { client_id: "", status: "unpaid", notes: "" };

const Invoices = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [invoice, setInvoice] = useState(emptyInvoice);
  const [items, setItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [removedItemIds, setRemovedItemIds] = useState([]);
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1 });
  const [search, setSearch] = useState("");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const response = await apiClient.get("/invoices/");
      return response.data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await apiClient.get("/products/")).data,
  });

  const productName = (id) => products?.find((p) => p.id === Number(id))?.name || `#${id}`;

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll,
  });
  const clientName = (id) => clients?.find((c) => c.id === Number(id))?.name || `Client #${id}`;

  const filteredInvoices = (invoices || []).filter((inv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      clientName(inv.client_id).toLowerCase().includes(q) ||
      inv.status?.toLowerCase().includes(q) ||
      String(inv.id).includes(q)
    );
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setInvoice(emptyInvoice);
    setItems([]);
    setExistingItems([]);
    setRemovedItemIds([]);
  };

  const openAddModal = () => {
    setEditingId(null);
    setInvoice(emptyInvoice);
    setItems([]);
    setExistingItems([]);
    setRemovedItemIds([]);
    setIsModalOpen(true);
  };

  const openEditModal = async (inv) => {
    setEditingId(inv.id);
    setInvoice({
      client_id: inv.client_id,
      status: inv.status,
      notes: inv.notes || "",
      // Kept so the save payload can carry them through unchanged - Invoice.date
      // has no client-facing edit field but is a required column with a
      // default_factory, so omitting it would let the backend silently reset
      // it to "now". total_amount is also carried through as-is; it only
      // changes when a line item is added or removed below (each of those
      // calls recalculates it server-side).
      date: inv.date,
      total_amount: inv.total_amount,
    });
    setItems([]);
    setRemovedItemIds([]);
    const res = await apiClient.get(`/invoices/${inv.id}/items`);
    setExistingItems(res.data);
    setIsModalOpen(true);
  };

  const saveInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceData, newItems, removedIds, id }) => {
      if (id) {
        await apiClient.put(`/invoices/${id}`, {
          client_id: Number(invoiceData.client_id),
          status: invoiceData.status,
          notes: invoiceData.notes,
          date: invoiceData.date,
          // Carried through unchanged; item add/remove calls below recalculate
          // it server-side whenever the line items actually change.
          total_amount: invoiceData.total_amount,
        });
        for (const itemId of removedIds) {
          await apiClient.delete(`/invoices/items/${itemId}`);
        }
        for (const item of newItems) {
          await apiClient.post("/invoices/items/", {
            invoice_id: id,
            product_id: Number(item.product_id),
            quantity: Number(item.quantity),
            unit_price: 0,
            subtotal: 0,
          });
        }
        return { id };
      }

      const created = await apiClient
        .post("/invoices/", invoiceData)
        .then((r) => r.data);

      for (const item of newItems) {
        // unit_price/subtotal are required by the schema but get recalculated
        // server-side from the product's real price, so the values sent here
        // don't matter.
        await apiClient.post("/invoices/items/", {
          invoice_id: created.id,
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_price: 0,
          subtotal: 0,
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      closeModal();
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id) => {
      const response = await apiClient.delete(`/invoices/${id}`);
      return response.data;
    },
    // Optimistic delete: remove it from the list the instant the user confirms,
    // instead of waiting for the round trip - roll back if the server call
    // actually fails (the toast system surfaces that error separately).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["invoices"] });
      const previousInvoices = queryClient.getQueryData(["invoices"]);
      queryClient.setQueryData(["invoices"], (old) => (old || []).filter((i) => i.id !== id));
      return { previousInvoices };
    },
    onError: (err, id, context) => {
      if (context?.previousInvoices) queryClient.setQueryData(["invoices"], context.previousInvoices);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const addItem = () => {
    if (!newItem.product_id) return;
    setItems([...items, { ...newItem, id: Date.now() }]);
    setNewItem({ product_id: "", quantity: 1 });
  };

  const removeItem = (id) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const removeExistingItem = (itemId) => {
    setRemovedItemIds([...removedItemIds, itemId]);
  };

  const undoRemoveExistingItem = (itemId) => {
    setRemovedItemIds(removedItemIds.filter((id) => id !== itemId));
  };

  const downloadInvoicePdf = async (id) => {
    const response = await apiClient.get(`/invoices/${id}/pdf`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(
      new Blob([response.data], { type: "application/pdf" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice_${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    saveInvoiceMutation.mutate({
      invoiceData: invoice,
      newItems: items,
      removedIds: removedItemIds,
      id: editingId,
    });
  };

  const keptExistingCount = existingItems.filter((i) => !removedItemIds.includes(i.id)).length;
  const canSave = editingId
    ? Boolean(invoice.client_id) && (keptExistingCount + items.length) > 0
    : Boolean(invoice.client_id) && items.length > 0;

  if (isLoading) return <div className="p-8 text-center">Loading invoices...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Invoices</h2>
          <p className="text-slate-500">Bill clients and generate PDF invoices</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> New Invoice
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoices by client, status or #..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">Invoice</th>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 font-medium">Client ID</th>
              <th className="px-6 py-3 font-medium">Total Amount</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-slate-600 font-medium">#{inv.id}</td>
                <td className="px-6 py-4 text-slate-600">{new Date(inv.date).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-slate-600">{clientName(inv.client_id)}</td>
                <td className="px-6 py-4 font-medium text-slate-800">R {inv.total_amount.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${
                      inv.status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : inv.status === "cancelled"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button
                    onClick={() => downloadInvoicePdf(inv.id)}
                    className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                    title="Download PDF"
                  >
                    <Download size={18} />
                  </button>
                  <button
                    onClick={() => openEditModal(inv)}
                    className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete invoice #${inv.id}? This can't be undone.`)) {
                        deleteInvoiceMutation.mutate(inv.id);
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                    title="Delete invoice"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                  {invoices?.length ? "No invoices match your search." : "No invoices yet. Create your first one above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? `Edit Invoice #${editingId}` : "New Invoice"}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
              <SearchableSelect
                value={invoice.client_id}
                onChange={(v) => setInvoice({ ...invoice, client_id: v })}
                options={(clients || []).map((c) => ({ value: c.id, label: c.name, sublabel: c.farm_name }))}
                placeholder="Select a client…"
                searchPlaceholder="Search clients…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={invoice.status}
                onChange={(e) => setInvoice({ ...invoice, status: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={invoice.notes}
              onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              rows={2}
            />
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <FileText size={18} /> Line Items
            </h4>
            <p className="text-xs text-slate-500">
              Prices are pulled automatically from the product catalogue — just pick the product and quantity.
            </p>

            {editingId && existingItems.length > 0 && (
              <div className="space-y-2">
                {existingItems.map((item) => {
                  const isRemoved = removedItemIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-2 border rounded-lg text-sm ${
                        isRemoved ? "bg-red-50 border-red-100 text-red-400 line-through" : "bg-white border-slate-100"
                      }`}
                    >
                      <span>{productName(item.product_id)} × {item.quantity} (R {item.subtotal.toLocaleString()})</span>
                      {isRemoved ? (
                        <button onClick={() => undoRemoveExistingItem(item.id)} className="text-emerald-500 hover:text-emerald-700 not-italic no-underline text-xs font-medium">
                          Undo
                        </button>
                      ) : (
                        <button onClick={() => removeExistingItem(item.id)} className="text-red-400 hover:text-red-600">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <SearchableSelect
                value={newItem.product_id}
                onChange={(v) => setNewItem({ ...newItem, product_id: v })}
                options={(products || []).map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Select product…"
                searchPlaceholder="Search products…"
              />
              <input
                type="number"
                placeholder="Qty"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                className="p-2 border border-slate-200 rounded-lg text-sm"
              />
              <button
                onClick={addItem}
                className="bg-emerald-600 text-white rounded-lg p-2 hover:bg-emerald-700 transition-colors"
              >
                <Plus size={18} className="mx-auto" />
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg text-sm"
                >
                  <span>{productName(item.product_id)} × {item.quantity}</span>
                  <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
                    <X size={16} />
                  </button>
                </div>
              ))}
              {items.length === 0 && existingItems.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">No line items added yet.</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              disabled={!canSave || saveInvoiceMutation.isPending}
              onClick={handleSave}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveInvoiceMutation.isPending
                ? "Saving..."
                : editingId
                ? "Save Changes"
                : "Create Invoice"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Invoices;
