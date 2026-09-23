import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ShoppingCart, Trash2, Edit } from "lucide-react";
import apiClient from "../api/client";
import { clientService } from "../api/services";
import Modal from "../components/Modal";
import SearchableSelect from "../components/SearchableSelect";

const emptyOrder = { client_id: "", quote_id: "", total_amount: 0, status: "Pending" };

const Orders = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyOrder);
  const [search, setSearch] = useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const response = await apiClient.get("/orders/");
      return response.data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll,
  });
  const clientName = (id) => clients?.find((c) => c.id === Number(id))?.name || `Client #${id}`;

  const { data: quotes } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => (await apiClient.get("/quotes/")).data,
  });

  const filteredOrders = (orders || []).filter((order) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      clientName(order.client_id).toLowerCase().includes(q) ||
      order.status?.toLowerCase().includes(q) ||
      String(order.id).includes(q)
    );
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyOrder);
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyOrder);
    setIsModalOpen(true);
  };

  const openEditModal = (order) => {
    setEditingId(order.id);
    setForm({
      client_id: order.client_id,
      quote_id: order.quote_id ?? "",
      total_amount: order.total_amount,
      status: order.status,
      // Kept so the save payload can carry it through unchanged - Order.date
      // has no client-facing edit field, but it's a required column, so
      // omitting it from the PUT body would let the backend default it to
      // "now" and silently overwrite the order's real date.
      date: order.date,
    });
    setIsModalOpen(true);
  };

  const addOrderMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post("/orders/", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      closeModal();
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, data }) => (await apiClient.put(`/orders/${id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      closeModal();
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id) => {
      const response = await apiClient.delete(`/orders/${id}`);
      return response.data;
    },
    // Optimistic delete: remove it from the list the instant the user confirms,
    // instead of waiting for the round trip - roll back if the server call
    // actually fails (the toast system surfaces that error separately).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previousOrders = queryClient.getQueryData(["orders"]);
      queryClient.setQueryData(["orders"], (old) => (old || []).filter((o) => o.id !== id));
      return { previousOrders };
    },
    onError: (err, id, context) => {
      if (context?.previousOrders) queryClient.setQueryData(["orders"], context.previousOrders);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const handleSave = () => {
    const payload = {
      client_id: Number(form.client_id),
      quote_id: form.quote_id === "" ? null : Number(form.quote_id),
      total_amount: Number(form.total_amount),
      status: form.status,
      ...(editingId ? { date: form.date } : {}),
    };
    if (editingId) {
      updateOrderMutation.mutate({ id: editingId, data: payload });
    } else {
      addOrderMutation.mutate(payload);
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading orders...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Orders Management</h2>
          <p className="text-slate-500">Track financial orders and shipment status</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Create New Order
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
              placeholder="Search orders by client, status or #..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">Order ID</th>
              <th className="px-6 py-3 font-medium">Client ID</th>
              <th className="px-6 py-3 font-medium">Total Amount</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  {orders?.length ? "No orders match your search." : "No orders yet."}
                </td>
              </tr>
            )}
            {filteredOrders.map(order => (
              <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-slate-600 font-medium">#{order.id}</td>
                <td className="px-6 py-4 text-slate-600">{clientName(order.client_id)}</td>
                <td className="px-6 py-4 font-medium text-slate-800">R {order.total_amount.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    order.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                    order.status === 'Shipped' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button onClick={() => openEditModal(order)} className="p-2 text-slate-400 hover:text-emerald-600 transition-colors" title="Edit">
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete order #${order.id}? This can't be undone.`)) {
                        deleteOrderMutation.mutate(order.id);
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
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? `Edit Order #${editingId}` : "Create New Order"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
              <SearchableSelect
                value={form.client_id}
                onChange={(v) => setForm({ ...form, client_id: v })}
                options={(clients || []).map((c) => ({ value: c.id, label: c.name, sublabel: c.farm_name }))}
                placeholder="Select a client…"
                searchPlaceholder="Search clients…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quote (Optional)</label>
              <select
                value={form.quote_id}
                onChange={e => setForm({...form, quote_id: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">None</option>
                {quotes?.map(q => (
                  <option key={q.id} value={q.id}>
                    Quote #{q.id} — {clientName(q.client_id)} (R {q.total_amount.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount</label>
              <input
                type="number"
                value={form.total_amount}
                onChange={e => setForm({...form, total_amount: Number(e.target.value)})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm({...form, status: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
                <option value="Shipped">Shipped</option>
              </select>
            </div>
          </div>
          <button
            disabled={!form.client_id || addOrderMutation.isPending || updateOrderMutation.isPending}
            onClick={handleSave}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {editingId
              ? (updateOrderMutation.isPending ? "Saving..." : "Save Changes")
              : (addOrderMutation.isPending ? "Saving..." : "Create Order")}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Orders;
