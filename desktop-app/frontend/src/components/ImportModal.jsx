import React, { useState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle, Eye } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import Modal from "./Modal";

// Shared upload UI for every "/xxx/import" endpoint (products, clients, herding programs, ...). Each of those
// endpoints already does its own column-matching and per-row error handling server-side. This component picks the
// file, first CHECKS it (the same import run with dry_run - nothing is saved) so you can see which columns were
// recognised and what would be created or updated, and only then imports it.
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
  const [preview, setPreview] = useState(null); // what the check said
  const [result, setResult] = useState(null); // what the real import did
  const queryClient = useQueryClient();

  const post = async (dryRun) => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await apiClient.post(endpoint, formData, {
      params: dryRun ? { dry_run: true } : undefined,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  };

  const checkMutation = useMutation({ mutationFn: () => post(true), onSuccess: (data) => { setPreview(data); setResult(null); } });
  const importMutation = useMutation({
    mutationFn: () => post(false),
    onSuccess: (data) => {
      setResult(data);
      setPreview(null);
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    checkMutation.reset();
    importMutation.reset();
    onClose();
  };

  const summary = (r) => (
    <>
      {r.created ?? 0} {createdLabel}, {r.updated ?? 0} {updatedLabel}
      {typeof r.skipped_blank === "number" ? `, ${r.skipped_blank} blank rows skipped` : ""}
    </>
  );
  const problems = (r) => r.errors?.length > 0 && (
    <div className="text-amber-700 space-y-1">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle size={16} />
        {r.errors.length} row{r.errors.length === 1 ? "" : "s"} {r.dry_run ? "will be skipped (a problem)" : "had a problem"}
      </div>
      <ul className="list-disc list-inside text-xs text-amber-600 max-h-32 overflow-y-auto">
        {r.errors.map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
      </ul>
    </div>
  );
  const columns = preview?.columns_matched && Object.entries(preview.columns_matched);
  const nothingToDo = preview && !preview.created && !preview.updated;

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
              setPreview(null);
              setResult(null);
              checkMutation.reset();
            }}
          />
        </label>

        {preview && (
          <div role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium text-sky-800"><Eye size={16} /> The check is done - nothing has been saved yet.</div>
            <p className="text-sky-900">If you import this file: {summary(preview)}.</p>
            {columns && columns.length > 0 && (
              <p className="text-xs text-sky-800">
                Columns recognised: {columns.map(([field, heading]) => `${heading} → ${field.replace(/_/g, " ")}`).join(", ")}.
              </p>
            )}
            {problems(preview)}
            {nothingToDo && <p className="text-amber-700">Nothing in this file can be imported. Check the column headings above, or choose another file.</p>}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-700 font-medium">
              <CheckCircle2 size={16} />
              Imported: {summary(result)}
            </div>
            {problems(result)}
          </div>
        )}

        {!preview ? (
          <button
            type="button"
            disabled={!file || checkMutation.isPending || importMutation.isPending}
            onClick={() => (result ? handleClose() : checkMutation.mutate())}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {result ? "Done" : checkMutation.isPending ? "Checking..." : "Check the file"}
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setPreview(null); }} className="flex-1 rounded-lg border border-slate-200 py-2 font-medium text-slate-700 hover:bg-slate-50">Back</button>
            <button
              type="button"
              disabled={importMutation.isPending || nothingToDo}
              onClick={() => importMutation.mutate()}
              className="flex-[2] bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {importMutation.isPending ? "Importing..." : `Import ${(preview.created ?? 0) + (preview.updated ?? 0)} row${(preview.created ?? 0) + (preview.updated ?? 0) === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportModal;
