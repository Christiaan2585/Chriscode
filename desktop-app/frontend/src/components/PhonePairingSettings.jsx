import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudDownload, RefreshCw, Smartphone } from "lucide-react";
import { clearPairing } from "../utils/pairing";
import { useReachable } from "../offline/connectivity";
import { forgetSyncState, syncNow, useSyncState } from "../offline/sync";
import { wipeOfflineData } from "../offline/store";

const when = (ms) =>
  ms ? new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

const card = "bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3";
const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

// Android only (see pages/Settings.jsx): the copy of the office data kept on this phone, and
// forgetting the office PC to pair again, e.g. after moving to a different PC.
const PhonePairingSettings = () => {
  const queryClient = useQueryClient();
  const reachable = useReachable();
  const sync = useSyncState();
  const [message, setMessage] = useState(null);

  const download = async () => {
    setMessage(null);
    const result = await syncNow({ deep: true, queryClient });
    if (!result) setMessage(reachable ? "A download is already running." : "The office PC can't be reached right now.");
    else if (result.aborted) setMessage("The download stopped because the office PC went out of reach.");
    else setMessage(result.failed ? `Downloaded, but ${result.failed} of ${result.total} items could not be fetched.` : "Everything is downloaded.");
  };

  return (
    <>
      <div className={card}>
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <CloudDownload size={18} /> Office data on this phone
        </h3>
        <p className="text-sm text-slate-500">
          This phone keeps a copy of the office data (clients, products, invoices, quotes, orders, programs and calendar) so you can look things up
          when the office Wi-Fi is out of reach. It refreshes by itself whenever the office PC is reachable, and changes you make while away
          (new quotes, ticked program dates) are sent when it is back.
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Office PC</dt>
          <dd className={reachable ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{reachable ? "Connected" : "Not reachable"}</dd>
          <dt className="text-slate-500">Last refreshed</dt>
          <dd className="font-medium text-slate-800">{when(sync.lastSyncedAt)}</dd>
          <dt className="text-slate-500">Last full download</dt>
          <dd className="font-medium text-slate-800">{when(sync.lastFullAt)}</dd>
          <dt className="text-slate-500">Saved answers</dt>
          <dd className="font-medium text-slate-800">{sync.saved}</dd>
        </dl>
        {sync.running && <p role="status" className="text-sm text-slate-600">Downloading... {Math.min(sync.done, sync.total)} of {sync.total}</p>}
        {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={sync.running || !reachable} onClick={download}>
            <RefreshCw size={14} className="mr-1.5 inline" /> Download everything again
          </button>
          <button
            type="button"
            className={button}
            disabled={sync.running}
            onClick={async () => {
              if (window.confirm("Remove the office data saved on this phone? It is downloaded again the next time the office PC is reachable.")) {
                await wipeOfflineData();
                await forgetSyncState();
                setMessage("The saved data was removed. Unlocking without the office PC works again after your next PIN entry online.");
              }
            }}
          >
            Remove saved data
          </button>
        </div>
      </div>

      <div className={card}>
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <Smartphone size={18} /> Office PC Pairing
        </h3>
        <p className="text-sm text-slate-500">This phone is paired with an office PC. Forgetting it will ask to pair again next time the app opens, and removes the saved office data.</p>
        <button
          type="button"
          onClick={async () => {
            if (window.confirm("Forget this phone's pairing with the office PC? The office data saved on this phone is removed too.")) {
              await wipeOfflineData();
              await clearPairing();
              window.location.reload();
            }
          }}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Forget this PC
        </button>
      </div>
    </>
  );
};

export default PhonePairingSettings;
