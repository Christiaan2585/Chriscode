import ShowMore from "../components/ShowMore";
import { usePaged } from "../utils/usePaged";
import React, { useState } from "react";
import { BulkBar, SelectAllTh, SelectTd } from "../components/BulkSelect";
import { useSelection } from "../utils/useSelection";
import { useOpenNew } from "../utils/useOpenNew";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, User, Trash2, Edit, Phone, MessageCircle } from "lucide-react";
import { clientService } from "../api/services";
import apiClient from "../api/client";
import { toTelLink, toWhatsAppLink } from "../utils/contact";
import Modal from "../components/Modal";
import { ClientHover } from "../components/PreviewCards";
import { farmLabel } from "../utils/format";
import { NO_TOWN, SORTS, filterAndSort, townsOf } from "../utils/clientList";

const emptyClient = { name: "", email: "", phone: "", address: "", postal_address: "", vat_number: "", farm_name: "", town: "", language: "" };
const filterInput = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

const Clients = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = "add" mode, id = "edit" mode
  const [form, setForm] = useState(emptyClient);
  const [search, setSearch] = useState("");
  const [town, setTown] = useState("");
  const [minAnimals, setMinAnimals] = useState("");
  const [maxAnimals, setMaxAnimals] = useState("");
  const [sort, setSort] = useState("name");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll
  });

  // {client id: animals on the farm} - the number the client page shows; missing = not recorded
  const { data: headcounts = {} } = useQuery({
    queryKey: ["client-headcounts"],
    queryFn: async () => (await apiClient.get("/clients/headcounts")).data,
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
      postal_address: client.postal_address || "",
      vat_number: client.vat_number || "",
      farm_name: client.farm_name || "",
      town: client.town || "",
      language: client.language || "",
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

  const filtered = filterAndSort(clients || [], headcounts, { search, town, minAnimals, maxAnimals, sort });
  const towns = townsOf(clients || []);
  const narrowed = Boolean(search.trim() || town || minAnimals !== "" || maxAnimals !== "" || sort !== "name");
  const clearFilters = () => { setSearch(""); setTown(""); setMinAnimals(""); setMaxAnimals(""); setSort("name"); };
  const paged = usePaged(filtered);
  const selection = useSelection((filtered).map((r) => r.id));

  useOpenNew(() => openAddModal()); // from the dashboard's quick actions (?new=1)

  if (isLoading) return <div className="p-8 text-center">Loading clients...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              placeholder="Search clients by name, farm, town, email or phone..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-4 py-3" role="group" aria-label="Filter and sort clients">
          <label className="text-xs text-slate-500">Town / area
            <select className={`${filterInput} mt-1 block`} value={town} onChange={(e) => setTown(e.target.value)}>
              <option value="">All towns</option>
              {towns.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={NO_TOWN}>No town set</option>
            </select></label>
          <label className="text-xs text-slate-500">Animals from
            <input className={`${filterInput} mt-1 block w-28`} type="number" min="0" inputMode="numeric" placeholder="any" value={minAnimals} onChange={(e) => setMinAnimals(e.target.value)} /></label>
          <label className="text-xs text-slate-500">to
            <input className={`${filterInput} mt-1 block w-28`} type="number" min="0" inputMode="numeric" placeholder="any" value={maxAnimals} onChange={(e) => setMaxAnimals(e.target.value)} /></label>
          <label className="text-xs text-slate-500">Sort by
            <select className={`${filterInput} mt-1 block`} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
          {narrowed && <button type="button" onClick={clearFilters} className="pb-2 text-sm text-emerald-700 hover:underline">Clear filters</button>}
          <p className="ml-auto pb-2 text-xs text-slate-500" aria-live="polite">Showing {filtered.length} of {clients?.length || 0}</p>
        </div>
        <div className="space-y-2 p-3 empty:hidden">
          <BulkBar selection={selection} noun="client" describe={(id) => farmLabel(clients?.find((r) => r.id === id)) || `#${id}`}
            deleteOne={(id) => apiClient.delete(`/clients/${id}`, { silent: true })}
            onDone={() => queryClient.invalidateQueries({ queryKey: ["clients"] })} />
        </div>
        <div className="relative overflow-x-auto">
        <table className="card-table w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
            <tr>
              <SelectAllTh selection={selection} />
              <th className="px-6 py-3 font-medium">Farm</th>
              <th className="px-6 py-3 font-medium">Contact</th>
              <th className="px-6 py-3 font-medium">Town &amp; address</th>
              <th className="px-6 py-3 font-medium text-right">Animals</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paged.visible.map(client => {
              const telLink = toTelLink(client.phone);
              const waLink = toWhatsAppLink(client.phone);
              return (
                <tr
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                <SelectTd selection={selection} id={client.id} label={`Select ${((id) => farmLabel(clients?.find((r) => r.id === id)) || `#${id}`)(client.id)}`} />
                  <td data-primary className="px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                      <User size={16} />
                    </div>
                    <div>
                      <ClientHover client={client} className="font-medium text-slate-700">{farmLabel(client)}</ClientHover>
                      {client.farm_name && <div className="text-xs text-slate-400">{client.name}</div>}
                    </div>
                  </td>
                  <td data-label="Contact" data-wide className="px-6 py-4 text-slate-600">
                    <div>{client.email || "—"}</div>
                    <div className="text-xs text-slate-400">{client.phone || ""}</div>
                  </td>
                  <td data-label="Town & address" data-wide className="px-6 py-4 text-slate-600">
                    {client.town && <div className="font-medium text-slate-700">{client.town}</div>}
                    <div className={client.town ? "text-xs text-slate-400" : ""}>{client.address}</div>
                  </td>
                  <td data-label="Animals" className="px-6 py-4 text-right text-slate-700">
                    {headcounts[client.id] !== undefined ? headcounts[client.id].toLocaleString() : <span className="text-slate-300">—</span>}
                  </td>
                  <td data-actions className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
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
                        title="Delete" data-admin-only
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
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                  {clients?.length ? "No clients match your search or filters." : "No clients yet - add your first one above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <ShowMore paged={paged} />
        </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Town / area</label>
            <input
              type="text"
              list="client-towns"
              maxLength={100}
              value={form.town}
              onChange={(e) => setForm({ ...form, town: e.target.value })}
              placeholder="e.g. Prieska"
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <datalist id="client-towns">{towns.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="client-language">Language for messages</label>
            <select
              id="client-language"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">English</option>
              <option value="af">Afrikaans</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Quotes, invoices, statements and reminders sent to this client are written in this language.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Physical Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                rows="3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Postal Address</label>
              <textarea
                value={form.postal_address}
                onChange={(e) => setForm({ ...form, postal_address: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                rows="3"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Customer VAT Number</label>
            <input
              value={form.vat_number}
              onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
              placeholder="Printed on invoices if the client has one"
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
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
