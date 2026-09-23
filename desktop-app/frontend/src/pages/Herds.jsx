import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import { clientService } from "../api/services";
import Modal from "../components/Modal";

const Herds = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newHerd, setNewHerd] = useState({ name: "", client_id: "" });

  const { data: herds, isLoading } = useQuery({
    queryKey: ["herds"],
    queryFn: async () => {
      const response = await apiClient.get("/herds/");
      return response.data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll,
  });
  const clientName = (id) => clients?.find((c) => c.id === Number(id))?.name || `Client #${id}`;

  const addMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post("/herds/", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["herds"] });
      setIsModalOpen(false);
      setNewHerd({ name: "", client_id: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const response = await apiClient.delete(`/herds/${id}`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["herds"] }),
  });

  if (isLoading) return <div className="p-8 text-center">Loading herds...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Herd Management</h2>
          <p className="text-slate-500">Organize animals into managed herding programs</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Create New Herd
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {herds?.map(herd => (
          <div key={herd.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <Users size={24} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (window.confirm(`Delete herd "${herd.name}"? This can't be undone.`)) {
                      deleteMutation.mutate(herd.id);
                    }
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                  title="Delete herd"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-1">{herd.name}</h3>
            <p className="text-sm text-slate-500 mb-4">Owner: {clientName(herd.client_id)}</p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-xs font-medium text-slate-400 uppercase">Herd Status</span>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">Active</span>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Herd">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Herd Name</label>
            <input
              type="text"
              value={newHerd.name}
              onChange={e => setNewHerd({...newHerd, name: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g. North Pasture Goats"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Owner (Client)</label>
            <select
              value={newHerd.client_id}
              onChange={e => setNewHerd({...newHerd, client_id: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">Select a client…</option>
              {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button
            disabled={!newHerd.name || !newHerd.client_id || addMutation.isPending}
            onClick={() => addMutation.mutate(newHerd)}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? "Creating..." : "Create Herd"}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Herds;
