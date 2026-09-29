import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import SearchableSelect from "./SearchableSelect";

// Turns an order form a client filled in and sent back (made with the
// client page's "Order form" button) into a draft quote. Errors - not an
// order form, nothing filled in - come through the app's error toast.
const OrderFormImport = ({ isOpen, onClose, clients = [], onOpenQuote }) => {
  const [file, setFile] = useState(null);
  const [clientId, setClientId] = useState("");
  const [result, setResult] = useState(null);
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", file);
      if (clientId) form.append("client_id", clientId);
      return (await apiClient.post("/quotes/from-order-form", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })).data;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  const close = () => {
    setFile(null);
    setClientId("");
    setResult(null);
    upload.reset();
    onClose();
  };

  const clientName = (id) => clients.find((c) => c.id === id)?.name || `client #${id}`;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Import order form">
      {result ? (
        <div className="space-y-4">
          <p role="status" className="flex items-start gap-2 text-sm text-emerald-700">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Quote <b>{result.quote.number}</b> made for <b>{clientName(result.quote.client_id)}</b>. It's a draft -
              check it before you send it.
            </span>
          </p>
          {result.skipped.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle size={16} aria-hidden="true" /> Left off the quote:
              </p>
              <ul className="mt-1 list-disc pl-6">
                {result.skipped.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
              Close
            </button>
            <button
              type="button"
              onClick={() => { const { quote } = result; close(); onOpenQuote(quote); }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              Open the quote
            </button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); upload.mutate(); }}>
          <p className="text-sm text-slate-600">
            Pick the order form PDF the client filled in and sent back. Every product with a quantity becomes a line
            on a new draft quote, at today's prices.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-emerald-400">
            <UploadCloud size={28} className="text-slate-400" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-700">{file ? file.name : "Choose the filled-in PDF"}</span>
            <input type="file" accept="application/pdf,.pdf" className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Client</span>
            <SearchableSelect
              value={clientId}
              onChange={setClientId}
              options={[{ value: "", label: "The client the form was made for" },
                ...clients.map((c) => ({ value: c.id, label: c.name, sublabel: c.farm_name }))]}
              placeholder="The client the form was made for"
              searchPlaceholder="Search clients…"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || upload.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {upload.isPending ? "Importing…" : "Make the quote"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default OrderFormImport;
