import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { QrCode, Smartphone, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";

const when = (iso) => (iso ? new Date(`${iso}Z`).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never");

// Counts down to the pairing code's expiry ("9:32").
const useCountdown = (expiresAt) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const left = Math.max(0, Math.round((new Date(`${expiresAt}Z`) - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
};

// The QR code a phone scans: where this PC is, its certificate fingerprint
// (so the phone only ever trusts this PC) and a one-time code.
const PairingDialog = ({ pairing, pairedCount, onClose }) => {
  const [image, setImage] = useState(null);
  const left = useCountdown(pairing?.expires_at);
  const [startCount] = useState(pairedCount);
  useEffect(() => {
    if (!pairing) return;
    QRCode.toDataURL(pairing.qr, { errorCorrectionLevel: "M", margin: 1, width: 320 }).then(setImage);
  }, [pairing]);
  const paired = pairedCount > startCount;

  return (
    <Modal isOpen={Boolean(pairing)} onClose={onClose} title="Pair a phone">
      {paired ? (
        <div className="space-y-4 text-center">
          <p role="status" className="text-lg font-semibold text-emerald-700">Phone paired.</p>
          <button type="button" onClick={onClose} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Done</button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600">
            On the phone, open the Sandveld app, choose <b>Pair with office PC</b> and scan this code.
            The phone must be on the same Wi-Fi as this PC.
          </p>
          {image && <img src={image} alt="Pairing QR code" className="mx-auto h-64 w-64 rounded-lg bg-white p-2" />}
          <p className="text-sm text-slate-600">
            Or type this code on the phone: <span className="font-mono text-lg font-bold tracking-widest text-slate-800">{pairing?.code}</span>
          </p>
          <p className="text-xs text-slate-500">
            {left === "0:00" ? "This code has expired - close this and make a new one." : `Works once, for ${left}.`}
          </p>
        </div>
      )}
    </Modal>
  );
};

// Settings -> Phones (admins, on the office PC): the phone connection
// switch, pairing, and the list of paired phones. See app/api/devices.py.
const PhoneSettings = () => {
  const queryClient = useQueryClient();
  const [pairing, setPairing] = useState(null);
  const { data: status } = useQuery({ queryKey: ["lan"], queryFn: async () => (await apiClient.get("/devices/lan")).data });
  const { data: phones = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => (await apiClient.get("/devices/")).data,
    refetchInterval: pairing ? 2000 : false, // notice the new phone while the QR code is up
  });

  const toggle = useMutation({
    mutationFn: async (enabled) => (await apiClient.put("/devices/lan", { enabled })).data,
    onSuccess: (data) => queryClient.setQueryData(["lan"], data),
  });
  const newCode = useMutation({
    mutationFn: async () => (await apiClient.post("/devices/pairing")).data,
    onSuccess: setPairing,
  });
  const remove = useMutation({
    mutationFn: (id) => apiClient.delete(`/devices/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devices"] }),
  });

  const on = Boolean(status?.enabled);
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        <Smartphone size={18} /> Phones
      </h3>
      <p className="text-sm text-slate-500">
        Let your team's phones use this PC's data over the office Wi-Fi. Only phones you pair here can connect,
        and only while the Sandveld app is open on this PC.
      </p>

      <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <button type="button" role="switch" aria-checked={on} aria-label="Allow phones" disabled={toggle.isPending || !status}
          onClick={() => toggle.mutate(!on)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${on ? "bg-emerald-600" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
        Allow phones
      </label>

      {on && status?.running && (
        <p className="text-sm text-emerald-700">
          Phones on this network can connect to {status.addresses.map((a) => `${a}:${status.port}`).join(" or ")}.
          Windows may ask once whether to allow this - choose <b>Private networks</b>.
        </p>
      )}
      {on && !status?.running && status?.error && <p role="alert" className="text-sm text-red-600">{status.error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold text-slate-800">Paired phones ({phones.length})</h4>
        <button type="button" disabled={!status?.running || newCode.isPending} onClick={() => newCode.mutate()}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
          <QrCode size={16} /> Pair a phone
        </button>
      </div>
      {phones.length === 0 ? (
        <p className="text-sm text-slate-400">No phones paired yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {phones.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="block font-medium text-slate-800">{p.name}</span>
                <span className="block text-xs text-slate-500">Paired {when(p.created_at)} · last used {when(p.last_seen_at)}</span>
              </span>
              <button type="button" aria-label={`Remove ${p.name}`} title="Remove this phone"
                onClick={() => { if (window.confirm(`Remove "${p.name}"? It won't be able to connect until it's paired again.`)) remove.mutate(p.id); }}
                className="p-1.5 text-slate-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pairing && (
        <PairingDialog pairing={pairing} pairedCount={phones.length} onClose={() => {
          setPairing(null);
          queryClient.invalidateQueries({ queryKey: ["devices"] });
        }} />
      )}
    </div>
  );
};

export default PhoneSettings;
