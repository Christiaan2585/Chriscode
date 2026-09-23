import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Stethoscope } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";

const emptyRecord = { diagnosis: "", treatment: "", medication: "", vet_name: "", notes: "" };

const MedicalModal = ({ isOpen, onClose, animalId, animalName }) => {
  const queryClient = useQueryClient();
  const [record, setRecord] = useState(emptyRecord);

  const { data: records, isLoading } = useQuery({
    queryKey: ["medical", animalId],
    queryFn: async () => (await apiClient.get(`/medical/animal/${animalId}`)).data,
    enabled: isOpen && !!animalId,
  });

  const addMutation = useMutation({
    mutationFn: async (data) =>
      (await apiClient.post("/medical/", { ...data, animal_id: animalId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medical", animalId] });
      setRecord(emptyRecord);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/medical/${id}`)).data,
    // Optimistic delete: remove it from the list the instant the user confirms,
    // instead of waiting for the round trip - roll back if the server call
    // actually fails (the toast system surfaces that error separately).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["medical", animalId] });
      const previousRecords = queryClient.getQueryData(["medical", animalId]);
      queryClient.setQueryData(["medical", animalId], (old) => (old || []).filter((r) => r.id !== id));
      return { previousRecords };
    },
    onError: (err, id, context) => {
      if (context?.previousRecords) queryClient.setQueryData(["medical", animalId], context.previousRecords);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["medical", animalId] }),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Medical Log — ${animalName || `Animal #${animalId}`}`}>
      <div className="space-y-6">
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {isLoading && <p className="text-sm text-slate-400">Loading records...</p>}
          {!isLoading && records?.length === 0 && (
            <p className="text-sm text-slate-400">No medical records yet.</p>
          )}
          {records?.map((r) => (
            <div key={r.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-semibold text-slate-800">{r.diagnosis}</div>
                  <div className="text-xs text-slate-500">{new Date(r.date).toLocaleDateString()}</div>
                  {r.treatment && <div className="text-slate-600 mt-1">Treatment: {r.treatment}</div>}
                  {r.medication && <div className="text-slate-600">Medication: {r.medication}</div>}
                  {r.vet_name && <div className="text-slate-600">Vet: {r.vet_name}</div>}
                  {r.notes && <div className="text-slate-500 italic mt-1">{r.notes}</div>}
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete this medical record (${r.diagnosis})? This can't be undone.`)) {
                      deleteMutation.mutate(r.id);
                    }
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                  title="Delete record"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-200 space-y-3">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
            <Stethoscope size={16} /> Add Record
          </h4>
          <input
            type="text"
            placeholder="Diagnosis *"
            value={record.diagnosis}
            onChange={(e) => setRecord({ ...record, diagnosis: e.target.value })}
            className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Treatment"
              value={record.treatment}
              onChange={(e) => setRecord({ ...record, treatment: e.target.value })}
              className="p-2 border border-slate-200 rounded-lg text-sm"
            />
            <input
              type="text"
              placeholder="Medication"
              value={record.medication}
              onChange={(e) => setRecord({ ...record, medication: e.target.value })}
              className="p-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Vet name"
            value={record.vet_name}
            onChange={(e) => setRecord({ ...record, vet_name: e.target.value })}
            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
          />
          <textarea
            placeholder="Notes"
            value={record.notes}
            onChange={(e) => setRecord({ ...record, notes: e.target.value })}
            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
            rows={2}
          />
          <button
            disabled={!record.diagnosis || addMutation.isPending}
            onClick={() => addMutation.mutate(record)}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> {addMutation.isPending ? "Saving..." : "Add Record"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MedicalModal;
