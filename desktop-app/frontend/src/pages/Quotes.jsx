import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Plus, Search, FileText, Trash2, Edit, Save, X, Download } from "lucide-react";
import apiClient from "../api/client";
import { clientService } from "../api/services";
import Modal from "../components/Modal";
import SearchableSelect from "../components/SearchableSelect";

const emptyQuote = { client_id: "", status: "Draft" };

const Quotes = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [quote, setQuote] = useState(emptyQuote);
  const [search, setSearch] = useState("");
  // Items already saved on the server (editing an existing quote) - each keeps
  // its real backend id so we know what to delete vs leave alone.
  const [existingItems, setExistingItems] = useState([]);
  const [removedItemIds, setRemovedItemIds] = useState([]);
  // Items added in this session that don't exist on the server yet.
  const [newItems, setNewItems] = useState([]);
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1, unit_price: 0 });

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => (await apiClient.get("/quotes/")).data,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await apiClient.get("/products/")).data,
  });
  const productName = (id) => products?.find((p) => p.id === Number(id))?.name || `Product #${id}`;

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll,
  });
  const clientName = (id) => clients?.find((c) => c.id === Number(id))?.name || `Client #${id}`;

  const filteredQuotes = (quotes || []).filter((q) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      clientName(q.client_id).toLowerCase().includes(query) ||
      q.status?.toLowerCase().includes(query) ||
      String(q.id).includes(query)
    );
  });

  // Arriving from the Calculator's "Create Quote" button: open the builder
  // pre-loaded with the line item it worked out, instead of an empty form.
  useEffect(() => {
    if (location.state?.presetItem) {
      setEditingId(null);
      setQuote({ ...emptyQuote, client_id: location.state.presetClientId || "" });
      setExistingItems([]);
      setRemovedItemIds([]);
      setNewItems([{ ...location.state.presetItem, _key: Date.now() }]);
      setIsModalOpen(true);
      // Clear the router state so navigating back here later doesn't re-open it.
      window.history.replaceState({}, document.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const currentTotal = () => {
    const kept = existingItems.filter((i) => !removedItemIds.includes(i.id));
    const all = [...kept, ...newItems];
    return all.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setQuote(emptyQuote);
    setExistingItems([]);
    setRemovedItemIds([]);
    setNewItems([]);
    setNewItem({ product_id: "", quantity: 1, unit_price: 0 });
  };

  const openAddModal = () => {
    setEditingId(null);
    setQuote(emptyQuote);
    setExistingItems([]);
    setRemovedItemIds([]);
    setNewItems([]);
    setIsModalOpen(true);
  };

  const openEditModal = async (q) => {
    setEditingId(q.id);
    setQuote({ client_id: q.client_id, status: q.status });
    setNewItems([]);
    setRemovedItemIds([]);
    const items = (await apiClient.get(`/quotes/${q.id}/items`)).data;
    setExistingItems(items);
    setIsModalOpen(true);
  };

  const saveQuoteMutation = useMutation({
    mutationFn: async () => {
      const total = currentTotal();
      if (editingId) {
        await apiClient.put(`/quotes/${editingId}`, {
          client_id: Number(quote.client_id),
          status: quote.status,
          date: quotes.find((q) => q.id === editingId)?.date,
          total_amount: total,
        });
        for (const itemId of removedItemIds) {
          await apiClient.delete(`/quotes/items/${itemId}`);
        }
        for (const item of newItems) {
          await apiClient.post(`/quotes/${editingId}/items`, {
            product_id: Number(item.product_id),
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.quantity * item.unit_price,
          });
        }
        return editingId;
      }

      const savedQuote = (
        await apiClient.post("/quotes/", {
          client_id: Number(quote.client_id),
          status: quote.status,
          total_amount: total,
        })
      ).data;
      for (const item of newItems) {
        await apiClient.post(`/quotes/${savedQuote.id}/items`, {
          product_id: Number(item.product_id),
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.quantity * item.unit_price,
        });
      }
      return savedQuote.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      closeModal();
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/quotes/${id}`)).data,
    // Optimistic delete: remove it from the list the instant the user confirms,
    // instead of waiting for the round trip - roll back if the server call
    // actually fails (the toast system surfaces that error separately).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["quotes"] });
      const previousQuotes = queryClient.getQueryData(["quotes"]);
      queryClient.setQueryData(["quotes"], (old) => (old || []).filter((q) => q.id !== id));
      return { previousQuotes };
    },
    onError: (err, id, context) => {
      if (context?.previousQuotes) queryClient.setQueryData(["quotes"], context.previousQuotes);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
  });

  const addItem = () => {
    if (!newItem.product_id) return;
    setNewItems([...newItems, { ...newItem, _key: Date.now() }]);
    setNewItem({ product_id: "", quantity: 1, unit_price: 0 });
  };

  const removeNewItem = (key) => setNewItems(newItems.filter((i) => i._key !== key));
  const removeExistingItem = (id) => setRemovedItemIds([...removedItemIds, id]);
  const restoreExistingItem = (id) => setRemovedItemIds(removedItemIds.filter((i) => i !== id));

  const downloadQuotePdf = async (id) => {
    const response = await apiClient.get(`/quotes/${id}/pdf`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(
      new Blob([response.data], { type: "application/pdf" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `quote_${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-8 text-center">Loading quotes...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Quotations</h2>
          <p className="text-slate-500">Manage and create financial quotes for clients</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Create Quote
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
              placeholder="Search quotes by client, status or #..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 font-medium">Client ID</th>
              <th className="px-6 py-3 font-medium">Total Amount</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredQuotes.map(q => (
              <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-slate-600">{new Date(q.date).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-slate-600">{clientName(q.client_id)}</td>
                <td className="px-6 py-4 font-medium text-slate-800">R {q.total_amount.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    q.status === 'Accepted' ? 'bg-emerald-100 text-emerald-700' :
                    q.status === 'Sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {q.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button
                    onClick={() => downloadQuotePdf(q.id)}
                    className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                    title="Download PDF"
                  >
                    <Download size={18} />
                  </button>
                  <button onClick={() => openEditModal(q)} className="p-2 text-slate-400 hover:text-emerald-600 transition-colors" title="Edit">
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete quote #${q.id}? This can't be undone.`)) {
                        deleteQuoteMutation.mutate(q.id);
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredQuotes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  {quotes?.length ? "No quotes match your search." : "No quotes yet. Create your first one above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? `Edit Quote #${editingId}` : "Quote Builder"}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
              <SearchableSelect
                value={quote.client_id}
                onChange={(v) => setQuote({ ...quote, client_id: v })}
                options={(clients || []).map((c) => ({ value: c.id, label: c.name, sublabel: c.farm_name }))}
                placeholder="Select a client…"
                searchPlaceholder="Search clients…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={quote.status}
                onChange={e => setQuote({...quote, status: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Accepted">Accepted</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <FileText size={18} /> Quote Items
            </h4>
            <div className="grid grid-cols-4 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <SearchableSelect
                value={newItem.product_id}
                onChange={(v) => {
                  const product = products?.find(p => p.id === Number(v));
                  setNewItem({
                    ...newItem,
                    product_id: v,
                    unit_price: product ? product.price : newItem.unit_price,
                  });
                }}
                options={(products || []).map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Select product…"
                searchPlaceholder="Search products…"
              />
              <input
                type="number"
                placeholder="Qty"
                value={newItem.quantity}
                onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})}
                className="p-2 border border-slate-200 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Price"
                value={newItem.unit_price}
                onChange={e => setNewItem({...newItem, unit_price: Number(e.target.value)})}
                className="p-2 border border-slate-200 rounded-lg text-sm"
              />
              <button
                onClick={addItem}
                className="bg-emerald-600 text-white rounded-lg p-2 hover:bg-emerald-700 transition-colors"
              >
                <Plus size={18} className="mx-auto" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {existingItems.map((item) => {
                const isRemoved = removedItemIds.includes(item.id);
                return (
                  <div
                    key={`existing-${item.id}`}
                    className={`flex items-center justify-between p-2 border rounded-lg text-sm ${isRemoved ? "bg-red-50 border-red-100 opacity-60" : "bg-white border-slate-100"}`}
                  >
                    <span className={isRemoved ? "line-through" : ""}>
                      {productName(item.product_id)} × {item.quantity} @ R{item.unit_price}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">R {(item.quantity * item.unit_price).toLocaleString()}</span>
                      {isRemoved ? (
                        <button onClick={() => restoreExistingItem(item.id)} className="text-emerald-500 hover:text-emerald-700 text-xs font-medium">
                          Undo
                        </button>
                      ) : (
                        <button onClick={() => removeExistingItem(item.id)} className="text-red-400 hover:text-red-600">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {newItems.map((item) => (
                <div key={item._key} className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-sm">
                  <span>{productName(item.product_id)} × {item.quantity} @ R{item.unit_price} <em className="text-emerald-600 not-italic text-xs">(new)</em></span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">R {(item.quantity * item.unit_price).toLocaleString()}</span>
                    <button onClick={() => removeNewItem(item._key)} className="text-red-400 hover:text-red-600">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {existingItems.length === 0 && newItems.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">No line items added yet.</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
            <div className="text-lg font-bold text-slate-800">
              Total: R {currentTotal().toLocaleString()}
            </div>
            <button
              disabled={!quote.client_id || saveQuoteMutation.isPending}
              onClick={() => saveQuoteMutation.mutate()}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              <Save size={20} /> {saveQuoteMutation.isPending ? "Saving..." : "Save Quote"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Quotes;
