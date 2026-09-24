import React, { useState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import Modal from "./Modal";

// Shared upload UI for every "/xxx/import" endpoint (products, clients,
// herding programs, ...). Each of those endpoints already does its own
// column-matching and per-row error handling server-side - this component's
// only job is picking a file, posting it, and showing the resulting
// created/updated/skipped/errors summary.
const ImportModal = ({
  isOpen,
  onClose,
  title,
  endpoint,
  columnHint,
  invalidateKeys = [],
  createdLabel = "created",
  updatedLabel = "updated",
}) => {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await apiClient.post(endpoint, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });

  const handleClose = () => {
    setFile(null);
    setResult(null);
    importMutation.reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{columnHint}</p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-8 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors">
          <UploadCloud size={28} className="text-slate-400" />
          <span className="text-sm text-slate-600">
            {file ? file.name : "Click to choose an Excel (.xlsx/.xls) or .csv file"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setResult(null);
            }}
          />
        </label>

        {result && (
          <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-700 font-medium">
              <CheckCircle2 size={16} />
              {result.created ?? 0} {createdLabel}, {result.updated ?? 0} {updatedLabel}
              {typeof result.skipped_blank === "number" ? `, ${result.skipped_blank} blank rows skipped` : ""}
            </div>
            {result.errors?.length > 0 && (
              <div className="text-amber-700 space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle size={16} />
                  {result.errors.length} row{result.errors.length === 1 ? "" : "s"} had a problem
                </div>
                <ul className="list-disc list-inside text-xs text-amber-600 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!file || importMutation.isPending}
          onClick={() => importMutation.mutate()}
          className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
        >
          {importMutation.isPending ? "Importing..." : "Import"}
        </button>
      </div>
    </Modal>
  );
};

export default ImportModal;
