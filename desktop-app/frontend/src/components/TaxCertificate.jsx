import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileCheck2, Trash2, Upload } from "lucide-react";
import apiClient from "../api/client";
import DocumentPreview from "./DocumentPreview";
import { fetchDocumentPdf, saveBlob } from "../utils/documents";
import { shortDate } from "../utils/format";

const MAX_BYTES = 10 * 1024 * 1024;
const iconButton = "p-1.5 text-slate-400 transition-colors hover:text-emerald-600";

// The client's tax certificate: a PDF or picture kept on their page.
const TaxCertificate = ({ clientId, clientName }) => {
  const queryClient = useQueryClient();
  const key = ["client", String(clientId), "tax-certificate"];
  const base = `/clients/${clientId}/tax-certificate`;
  const { data: info } = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get(`${base}/info`)).data });
  const [problem, setProblem] = useState(null);
  const [preview, setPreview] = useState(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["clients", String(clientId), "summary"] });
  };
  const upload = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file);
      return (await apiClient.put(base, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: () => apiClient.delete(base), onSuccess: refresh });

  const choose = (file) => {
    setProblem(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setProblem("That file is over 10 MB.");
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) return setProblem("Choose a PDF, PNG or JPEG file.");
    upload.mutate(file);
  };

  const isPdf = info?.content_type === "application/pdf";
  const view = () => setPreview({
    kind: "tax-certificate", id: clientId, title: clientName ? `- ${clientName}` : "", url: base,
    filename: info.filename, noPrint: !isPdf,
  });
  const download = async () => saveBlob(await fetchDocumentPdf("tax-certificate", clientId, base), info.filename);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 border-b pb-2 text-lg font-semibold">
        <FileCheck2 size={18} className="text-emerald-600" /> Tax certificate
      </h3>
      {info?.exists ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-3 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-700" title={info.filename}>{info.filename}</div>
            <div className="text-xs text-slate-400">Loaded {shortDate(info.uploaded_at)}</div>
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={view} title="View" aria-label="View the tax certificate" className={iconButton}><Eye size={16} /></button>
            <button type="button" onClick={download} title="Download" aria-label="Download the tax certificate" className={iconButton}><Download size={16} /></button>
            <button type="button" title="Delete" aria-label="Delete the tax certificate" className={`${iconButton} hover:!text-red-600`}
              onClick={() => { if (window.confirm("Delete this client's tax certificate? This can't be undone.")) remove.mutate(); }}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No tax certificate loaded yet.</p>
      )}
      <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-400 ${upload.isPending ? "pointer-events-none opacity-50" : ""}`}>
        <Upload size={16} /> {upload.isPending ? "Loading…" : info?.exists ? "Replace the certificate" : "Import the certificate"}
        <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" className="sr-only"
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {problem && <p role="alert" className="mt-2 text-sm text-red-600">{problem}</p>}
      <p className="mt-2 text-xs text-slate-400">A PDF, PNG or JPEG, up to 10 MB. It's kept in the app's data, so it's in your backups.</p>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
};

export default TaxCertificate;
