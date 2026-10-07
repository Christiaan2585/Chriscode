import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ShieldAlert } from "lucide-react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { saveBlob } from "../utils/documents";
import { farmLabel } from "../utils/format";
import Modal from "./Modal";

const detailOf = (error) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : "That did not work.";
};

// Admins: what to do when a client asks "what do you keep about me?" or "forget me".
const ClientPrivacy = ({ client }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [erasing, setErasing] = useState(false);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!user?.is_admin) return null;
  const name = farmLabel(client);

  const exportData = async () => {
    setMessage(null);
    try {
      const response = await apiClient.get(`/clients/${client.id}/export`, { responseType: "blob" });
      saveBlob(response.data, `Client data - ${name}.json`);
    } catch (error) {
      setMessage(detailOf(error));
    }
  };

  const erase = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.post(`/clients/${client.id}/erase`, { confirm_name: typed });
      setErasing(false);
      setTyped("");
      queryClient.invalidateQueries();
    } catch (error) {
      setMessage(detailOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 border-b pb-2 text-lg font-semibold">
        <ShieldAlert size={18} className="text-emerald-600" /> Privacy
      </h3>
      {client.erased_at ? (
        <p className="text-sm text-slate-500">This client's personal details were erased on {new Date(client.erased_at).toLocaleDateString()}. Their invoices, quotes and orders are kept for your records.</p>
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          <p>If this client asks what you keep about them, or asks to be forgotten:</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportData}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 shadow-sm hover:border-emerald-400">
              <Download size={16} /> Export their data
            </button>
            <button type="button" onClick={() => { setErasing(true); setMessage(null); }}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 font-medium text-red-700 hover:bg-red-50">
              Erase their personal details...
            </button>
          </div>
        </div>
      )}
      {message && !erasing && <p role="alert" className="mt-2 text-sm text-red-600">{message}</p>}

      <Modal isOpen={erasing} onClose={() => setErasing(false)} title="Erase this client's personal details">
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            This removes <b>{name}</b>'s name, contact details, tax number, notes, visits, animals and tax certificate. It cannot be undone.
          </p>
          <p>
            Their <b>invoices, quotes and orders stay</b> (the law has you keep your accounting records for years), but will show
            "Erased client" instead of their name.
          </p>
          <label className="block">Type <b>{name}</b> to confirm
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </label>
          {message && <p role="alert" className="text-red-600">{message}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2" onClick={() => setErasing(false)}>Cancel</button>
            <button type="button" disabled={busy || !typed.trim()} onClick={erase}
              className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? "Erasing..." : "Erase personal details"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ClientPrivacy;
