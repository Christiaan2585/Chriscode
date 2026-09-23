import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Dog, Trash2, Activity, Scale, Edit } from "lucide-react";
import { animalService, clientService } from "../api/services";
import Modal from "../components/Modal";
import MedicalModal from "../components/MedicalModal";
import WeightModal from "../components/WeightModal";

const SPECIES_OPTIONS = ["Goats", "Sheep", "Cows", "Horses", "Pigs"];
const AGE_GROUP_OPTIONS = ["Young", "Adult"];
const emptyAnimal = {
  name: "",
  species: SPECIES_OPTIONS[0],
  age_group: AGE_GROUP_OPTIONS[1],
  breed: "",
  client_id: "",
  tag_id: "",
  gender: "",
};

const Animals = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyAnimal);
  const [search, setSearch] = useState("");

  const { data: animals, isLoading } = useQuery({
    queryKey: ["animals"],
    queryFn: animalService.getAll
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll,
  });
  const clientName = (id) => clients?.find((c) => c.id === Number(id))?.name || `Client #${id}`;

  const filteredAnimals = (animals || []).filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name?.toLowerCase().includes(q) ||
      a.species?.toLowerCase().includes(q) ||
      a.breed?.toLowerCase().includes(q) ||
      a.tag_id?.toLowerCase().includes(q)
    );
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyAnimal);
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyAnimal);
    setIsModalOpen(true);
  };

  const openEditModal = (animal) => {
    setEditingId(animal.id);
    setForm({
      name: animal.name || "",
      species: animal.species || SPECIES_OPTIONS[0],
      age_group: animal.age_group || AGE_GROUP_OPTIONS[1],
      breed: animal.breed || "",
      client_id: animal.client_id ?? "",
      tag_id: animal.tag_id || "",
      gender: animal.gender || "",
    });
    setIsModalOpen(true);
  };

  const addMutation = useMutation({
    mutationFn: animalService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animals"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => animalService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animals"] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: animalService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["animals"] }),
  });

  const handleSave = () => {
    const payload = { ...form, client_id: Number(form.client_id) };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const [medicalTarget, setMedicalTarget] = useState(null);
  const [weightTarget, setWeightTarget] = useState(null);

  if (isLoading) return <div className="p-8 text-center">Loading animals...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Animal Registry</h2>
          <p className="text-slate-500">Track and manage animal health and growth</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Register Animal
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
              placeholder="Search animals by name, species, breed or tag..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Species</th>
              <th className="px-6 py-3 font-medium">Age Group</th>
              <th className="px-6 py-3 font-medium">Breed</th>
              <th className="px-6 py-3 font-medium">Tag</th>
              <th className="px-6 py-3 font-medium">Client ID</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAnimals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                  {animals?.length ? "No animals match your search." : "No animals registered yet."}
                </td>
              </tr>
            )}
            {filteredAnimals.map(animal => (
              <tr key={animal.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <Dog size={16} />
                  </div>
                  <span className="font-medium text-slate-700">{animal.name}</span>
                </td>
                <td className="px-6 py-4 text-slate-600">{animal.species}</td>
                <td className="px-6 py-4 text-slate-600">{animal.age_group}</td>
                <td className="px-6 py-4 text-slate-600">{animal.breed}</td>
                <td className="px-6 py-4 text-slate-600">{animal.tag_id || "—"}</td>
                <td className="px-6 py-4 text-slate-600">{clientName(animal.client_id)}</td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button
                    onClick={() => setMedicalTarget(animal)}
                    className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                    title="Medical Log"
                  >
                    <Activity size={18} />
                  </button>
                  <button
                    onClick={() => setWeightTarget(animal)}
                    className="p-2 text-slate-400 hover:text-purple-600 transition-colors"
                    title="Weight Log"
                  >
                    <Scale size={18} />
                  </button>
                  <button
                    onClick={() => openEditModal(animal)}
                    className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete ${animal.name}? This can't be undone.`)) {
                        deleteMutation.mutate(animal.id);
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

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? "Edit Animal" : "Register New Animal"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Animal Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Species</label>
              <select
                value={form.species}
                onChange={e => setForm({...form, species: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {SPECIES_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Age Group</label>
              <select
                value={form.age_group}
                onChange={e => setForm({...form, age_group: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {AGE_GROUP_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Breed</label>
              <input
                type="text"
                value={form.breed}
                onChange={e => setForm({...form, breed: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tag / Ear Tag ID</label>
              <input
                type="text"
                value={form.tag_id}
                onChange={e => setForm({...form, tag_id: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
              <input
                type="text"
                value={form.gender}
                onChange={e => setForm({...form, gender: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Owner (Client)</label>
            <select
              value={form.client_id}
              onChange={e => setForm({...form, client_id: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">Select a client…</option>
              {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button
            disabled={!form.name || !form.client_id || addMutation.isPending || updateMutation.isPending}
            onClick={handleSave}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {editingId
              ? (updateMutation.isPending ? "Saving..." : "Save Changes")
              : (addMutation.isPending ? "Saving..." : "Register Animal")}
          </button>
        </div>
      </Modal>

      {medicalTarget && (
        <MedicalModal
          isOpen={!!medicalTarget}
          onClose={() => setMedicalTarget(null)}
          animalId={medicalTarget.id}
          animalName={medicalTarget.name}
        />
      )}
      {weightTarget && (
        <WeightModal
          isOpen={!!weightTarget}
          onClose={() => setWeightTarget(null)}
          animalId={weightTarget.id}
          animalName={weightTarget.name}
        />
      )}
    </div>
  );
};

export default Animals;
