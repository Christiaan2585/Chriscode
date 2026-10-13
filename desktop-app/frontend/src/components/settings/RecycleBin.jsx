import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import apiClient from "../../api/client";
import SettingsCard from "./SettingsCard";
import { shortDate } from "../../utils/format";

const KIND = { client: "Client", invoice: "Invoice", quote: "Quote", order: "Order", product: "Product", supplier: "Supplier",
  "purchase order": "Purchase order", "herding program": "Herding program" };

// Settings -> Recycle bin (admins): what was deleted in the last 30 days, with Restore. A restore puts back the
// record and everything that went with it; it is refused (with the reason) if something new took its place.
const RecycleBin = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["trash"], queryFn: async () => (await apiClient.get("/trash/")).data });
  const [error, setError] = useState("");
  const done = () => { setError(""); queryClient.invalidateQueries(); };
  const fail = (err) => setError(err?.response?.data?.detail?.toString?.() || "That didn't work.");
  const restore = useMutation({ mutationFn: (id) => apiClient.post(`/trash/${id}/restore`, null, { silent: true }), onSuccess: done, onError: fail });
  const forget = useMutation({ mutationFn: (id) => apiClient.delete(`/trash/${id}`, { silent: true }), onSuccess: done, onError: fail });

  return (
    <SettingsCard icon={Trash2} title="Recycle bin">
      <p className="text-sm text-slate-600">
        Anything an admin deletes waits here for 30 days. Restoring brings back the record and everything that went with it
        (an invoice's lines and payments, a client's notes and visits).
      </p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : !data?.length ? (
        <p className="text-sm text-slate-500">The recycle bin is empty.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-slate-800">{item.label}</span>{" "}
                <span className="text-slate-500">{KIND[item.kind] || item.kind} · deleted {shortDate(item.deleted_at)} · {item.days_left} days left</span>
              </span>
              <span className="flex gap-2">
                <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(item.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-400 disabled:opacity-50">
                  <RotateCcw size={14} /> Restore
                </button>
                <button type="button" disabled={forget.isPending}
                  onClick={() => window.confirm(`Delete ${item.label} for good? This cannot be undone.`) && forget.mutate(item.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-500 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                  Delete for good
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
};

export default RecycleBin;
