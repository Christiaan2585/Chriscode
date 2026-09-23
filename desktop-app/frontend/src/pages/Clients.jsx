import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, User, Trash2, Edit, Phone, MessageCircle } from "lucide-react";
import { clientService } from "../api/services";
import { toTelLink, toWhatsAppLink } from "../utils/contact";
import Modal from "../components/Modal";

const emptyClient = { name: "", email: "", phone: "", address: "", farm_name: "" };

const Clients = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = "add" mode, id = "edit" mode
  const [form, setForm] = useState(emptyClient);
  const [search, setSearch] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll
  });

  const addMutation = useMutation({
    mutationFn: clientService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => clientService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: clientService.delete,
    // Optimistic delete: remove it from the list the instant the user confirms,
    // instead of waiting for the round trip - roll back if the server call
    // actually fails (the toast system surfaces that error separately).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["clients"] });
      const previousClients = queryClient.getQueryData(["clients"]);
      queryClient.setQueryData(["clients"], (old) => (old || []).filter((c) => c.id !== id));
      return { previousClients };
    },
    onError: (err, id, context) => {
      if (context?.previousClients) queryClient.setQueryData(["clients"], context.previousClients);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyClient);
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyClient);
    setIsModalOpen(true);
  };

  const openEditModal = (client) => {
    setEditingId(client.id);
    setForm({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      farm_name: client.farm_name || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      addMutation.mutate(form);
    }
  };

  const filtered = (clients || []).filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name?.toLowerCase().includes(q) ||
      c.farm_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  });

  if (isLoading) return <div className="p-8 text-center">Loading clients...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Clients</h2>
          <p className="text-slate-500">Manage your agricultural client database</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Add Client
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
              placeholder="Search clients by name, farm, email or phone..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Farm</th>
              <th className="px-6 py-3 font-medium">Contact</th>
              <th className="px-6 py-3 font-medium">Location</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(client => {
              const telLink = toTelLink(client.phone);
              const waLink = toWhatsAppLink(client.phone);
              return (
                <tr
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                      <User size={16} />
                    </div>
                    <span className="font-medium text-slate-700">{client.name}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{client.farm_name || "—"}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <div>{client.email || "—"}</div>
                    <div className="text-xs text-slate-400">{client.phone || ""}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{client.address}</td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {telLink && (
                        <a
                          href={telLink}
                          className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          title={`Call ${client.name}`}
                        >
                          <Phone size={18} />
                        </a>
                      )}
                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={`WhatsApp ${client.name}`}
                        >
                          <MessageCircle size={18} />
                        </a>
                      )}
                      <button
                        onClick={() => openEditModal(client)}
                        className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete "${client.name}"? This can't be undone.`)) {
                            deleteMutation.mutate(client.id);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  {clients?.length ? "No clients match your search." : "No clients yet - add your first one above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? "Edit Client" : "Add New Client"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Farm / Business Name</label>
            <input
              type="text"
              value={form.farm_name}
              onChange={e => setForm({...form, farm_name: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cell / WhatsApp Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm({...form, phone: e.target.value})}
                placeholder="082 888 8284"
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Physical Address</label>
            <textarea
              value={form.address}
              onChange={e => setForm({...form, address: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              rows="3"
            ></textarea>
          </div>
          <button
            disabled={!form.name || addMutation.isPending || updateMutation.isPending}
            onClick={handleSave}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {editingId
              ? (updateMutation.isPending ? "Saving..." : "Save Changes")
              : (addMutation.isPending ? "Saving..." : "Save Client")}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Clients;
