import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import apiClient from "../api/client";
import { DEFAULT_RELAY_ADDRESS } from "../config/relay";

// Settings -> Phones (PC): "Connect from anywhere". The PC keeps one outbound connection to a relay (relay/server.py)
// and phones reach it through there from any network - nothing to install, no router settings. Everything between the
// phone and this PC stays encrypted end to end; the relay only passes it on.
const RelaySettings = ({ status, phonesOn }) => {
  const queryClient = useQueryClient();
  const relay = status?.relay;
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (relay?.host) setAddress(`${relay.host}${relay.port && relay.port !== 8447 ? `:${relay.port}` : ""}`);
  }, [relay?.host, relay?.port]);

  const save = useMutation({
    mutationFn: async (enabled) => (await apiClient.put("/devices/relay", { enabled, address: address.trim() || DEFAULT_RELAY_ADDRESS || null }, { silent: true })).data,
    onSuccess: () => { setError(""); queryClient.invalidateQueries({ queryKey: ["lan"] }); },
    onError: (err) => setError(err?.response?.data?.detail?.toString?.() || "That did not save."),
  });
  const newKey = useMutation({
    mutationFn: async () => (await apiClient.post("/devices/relay/new-key", null, { silent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lan"] }),
  });
  if (!status) return null;

  const on = Boolean(relay?.enabled);
  const needsAddress = !DEFAULT_RELAY_ADDRESS;
  return (
    <section aria-label="Connect from anywhere" className="space-y-3 rounded-lg border border-slate-200 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Globe size={16} /> Connect from anywhere</h4>
      <p className="text-xs text-slate-500">
        Phones reach this PC from any Wi-Fi or mobile data, even when the office Wi-Fi will not let them connect directly - nothing to install and no
        router settings. Everything stays encrypted between the phone and this PC; the relay only passes it on and cannot read it.
      </p>
      <div className="flex items-center gap-3 text-sm font-medium text-slate-800">
        <button type="button" role="switch" aria-checked={on} aria-label="Connect from anywhere" disabled={save.isPending || !phonesOn || (!on && needsAddress && !address.trim())}
          onClick={() => save.mutate(!on)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${on ? "bg-emerald-600" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
        Connect from anywhere
      </div>
      {!phonesOn && <p className="text-xs text-amber-700">Switch on "Allow phones" above first.</p>}
      {(needsAddress || on) && (
        <label className="block text-xs text-slate-500">Relay address{needsAddress ? "" : " (set by your supplier)"}
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder={DEFAULT_RELAY_ADDRESS || "relay.example.com"} value={address} onChange={(e) => setAddress(e.target.value)} onBlur={() => on && address.trim() && save.mutate(true)} />
        </label>
      )}
      {on && relay?.connected && <p role="status" className="text-sm text-emerald-700">Connected to the relay: phones can reach this PC from anywhere.</p>}
      {on && !relay?.connected && !relay?.error && <p role="status" className="text-sm text-slate-600">Connecting to the relay...</p>}
      {on && relay?.error && <p role="alert" className="text-sm text-red-600">{relay.error}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {on && (
        <button type="button" disabled={newKey.isPending} className="text-xs text-slate-500 hover:underline"
          onClick={() => { if (window.confirm("Make a new key? A phone you removed (or lost) can no longer use the relay. Phones you still use pick the new key up the next time they reach this PC.")) newKey.mutate(); }}>
          Make a new key for phones
        </button>
      )}
    </section>
  );
};

export default RelaySettings;
