import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Scale, TrendingUp, TrendingDown } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";

const WeightModal = ({ isOpen, onClose, animalId, animalName }) => {
  const queryClient = useQueryClient();
  const [entry, setEntry] = useState({ weight: "", unit: "kg", notes: "" });

  const { data: logs, isLoading } = useQuery({
    queryKey: ["weights", animalId],
    queryFn: async () => (await apiClient.get(`/weights/animal/${animalId}`)).data,
    enabled: isOpen && !!animalId,
  });

  const addMutation = useMutation({
    mutationFn: async (data) =>
      (
        await apiClient.post("/weights/", {
          ...data,
          weight: Number(data.weight),
          animal_id: animalId,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weights", animalId] });
      setEntry({ weight: "", unit: "kg", notes: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/weights/${id}`)).data,
    // Optimistic delete: remove it from the list the instant the user confirms,
    // instead of waiting for the round trip - roll back if the server call
    // actually fails (the toast system surfaces that error separately).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["weights", animalId] });
      const previousLogs = queryClient.getQueryData(["weights", animalId]);
      queryClient.setQueryData(["weights", animalId], (old) => (old || []).filter((l) => l.id !== id));
      return { previousLogs };
    },
    onError: (err, id, context) => {
      if (context?.previousLogs) queryClient.setQueryData(["weights", animalId], context.previousLogs);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["weights", animalId] }),
  });

  const first = logs?.[0];
  const latest = logs?.[logs.length - 1];
  const change = first && latest && logs.length > 1 ? latest.weight - first.weight : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Weight Log — ${animalName || `Animal #${animalId}`}`}>
      <div className="space-y-6">
        {latest && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-400 uppercase font-bold">Latest</div>
              <div className="text-xl font-bold text-slate-800">
                {latest.weight} {latest.unit}
              </div>
              <div className="text-xs text-slate-400">{new Date(latest.date).toLocaleDateString()}</div>
            </div>
            {change !== null && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs text-slate-400 uppercase font-bold">Since first log</div>
                <div
                  className={`text-xl font-bold flex items-center gap-1 ${
                    change >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {change >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(1)} {latest.unit}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 max-h-56 overflow-y-auto">
          {isLoading && <p className="text-sm text-slate-400">Loading entries...</p>}
          {!isLoading && logs?.length === 0 && (
            <p className="text-sm text-slate-400">No weight entries yet.</p>
          )}
          {[...(logs || [])].reverse().map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg text-sm"
            >
              <span>
                {new Date(log.date).toLocaleDateString()} — <strong>{log.weight} {log.unit}</strong>
                {log.notes && <span className="text-slate-400"> ({log.notes})</span>}
              </span>
              <button
                onClick={() => {
                  if (window.confirm(`Delete this weight entry (${log.weight} ${log.unit})? This can't be undone.`)) {
                    deleteMutation.mutate(log.id);
                  }
                }}
                className="text-slate-400 hover:text-red-600"
                title="Delete entry"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-200 space-y-3">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
            <Scale size={16} /> Log New Weight
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              placeholder="Weight"
              value={entry.weight}
              onChange={(e) => setEntry({ ...entry, weight: e.target.value })}
              className="p-2 border border-slate-200 rounded-lg text-sm"
            />
            <select
              value={entry.unit}
              onChange={(e) => setEntry({ ...entry, unit: e.target.value })}
              className="p-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
            <button
              disabled={!entry.weight || addMutation.isPending}
              onClick={() => addMutation.mutate(entry)}
              className="flex items-center justify-center gap-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Log
            </button>
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={entry.notes}
            onChange={(e) => setEntry({ ...entry, notes: e.target.value })}
            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
      </div>
    </Modal>
  );
};

export default WeightModal;
