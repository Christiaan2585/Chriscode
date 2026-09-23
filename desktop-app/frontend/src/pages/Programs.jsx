import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ClipboardList, Trash2, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import apiClient from "../api/client";
import Modal from "../components/Modal";

const emptyProgram = { name: "", goal: "", start_date: "", end_date: "", description: "" };

const Programs = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [program, setProgram] = useState(emptyProgram);
  const [expandedId, setExpandedId] = useState(null);
  const [animalIdInput, setAnimalIdInput] = useState("");

  const { data: programs, isLoading } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await apiClient.get("/programs/")).data,
  });

  const addMutation = useMutation({
    mutationFn: async (data) => (await apiClient.post("/programs/", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      setIsModalOpen(false);
      setProgram(emptyProgram);
    },
  });

  const { data: assignedAnimals } = useQuery({
    queryKey: ["program-animals", expandedId],
    queryFn: async () => (await apiClient.get(`/programs/${expandedId}/animals`)).data,
    enabled: !!expandedId,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ animal_id, program_id }) =>
      (await apiClient.post("/programs/assign", { animal_id, program_id })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["program-animals", expandedId] });
      setAnimalIdInput("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ animal_id, program_id }) =>
      (await apiClient.delete(`/programs/assign/${animal_id}/${program_id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["program-animals", expandedId] }),
  });

  if (isLoading) return <div className="p-8 text-center">Loading programs...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Herding Programs</h2>
          <p className="text-slate-500">Treatment/vaccination programs you can assign animals to</p>
        </div>
        <button
          onClick={() => {
            setProgram(emptyProgram);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> New Program
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {programs?.map((p) => {
          const isOpen = expandedId === p.id;
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl w-fit">
                    <ClipboardList size={22} />
                  </div>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : p.id)}
                    className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                  >
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
                <h3 className="text-lg font-bold text-slate-800">{p.name}</h3>
                {p.goal && <p className="text-sm text-slate-500 mt-1">{p.goal}</p>}
                {(p.start_date || p.end_date) && (
                  <p className="text-xs text-slate-400 mt-2">
                    {p.start_date ? new Date(p.start_date).toLocaleDateString() : "—"}
                    {" → "}
                    {p.end_date ? new Date(p.end_date).toLocaleDateString() : "—"}
                  </p>
                )}
                {p.description && <p className="text-sm text-slate-500 mt-2">{p.description}</p>}
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 p-6 bg-slate-50 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <UserPlus size={16} /> Assigned Animals
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(assignedAnimals || []).length === 0 && (
                      <p className="text-xs text-slate-400">No animals assigned yet.</p>
                    )}
                    {(assignedAnimals || []).map((animalId) => (
                      <span
                        key={animalId}
                        className="flex items-center gap-1 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-medium text-slate-600"
                      >
                        Animal #{animalId}
                        <button
                          onClick={() => removeMutation.mutate({ animal_id: animalId, program_id: p.id })}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <input
                      type="number"
                      placeholder="Animal ID"
                      value={animalIdInput}
                      onChange={(e) => setAnimalIdInput(e.target.value)}
                      className="flex-1 p-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <button
                      disabled={!animalIdInput}
                      onClick={() =>
                        assignMutation.mutate({ animal_id: Number(animalIdInput), program_id: p.id })
                      }
                      className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {programs?.length === 0 && (
          <div className="lg:col-span-2 bg-slate-100 p-12 rounded-2xl border-2 border-dashed border-slate-300 text-center text-slate-500">
            No programs yet. Create one to start assigning animals to a treatment schedule.
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Herding Program">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program Name</label>
            <input
              type="text"
              value={program.name}
              onChange={(e) => setProgram({ ...program, name: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g. Winter Vaccination Cycle"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
            <input
              type="text"
              value={program.goal}
              onChange={(e) => setProgram({ ...program, goal: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={program.start_date}
                onChange={(e) => setProgram({ ...program, start_date: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                value={program.end_date}
                onChange={(e) => setProgram({ ...program, end_date: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={program.description}
              onChange={(e) => setProgram({ ...program, description: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              rows={3}
            />
          </div>
          <button
            disabled={!program.name || addMutation.isPending}
            onClick={() => addMutation.mutate(program)}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {addMutation.isPending ? "Saving..." : "Create Program"}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Programs;
