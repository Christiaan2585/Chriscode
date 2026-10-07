import React, { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, DownloadCloud, AlertTriangle } from "lucide-react";
import { isUpdaterAvailable, checkForUpdates, quitAndInstall, getUpdateStatus, onUpdateStatus } from "../../utils/updater";

const SoftwareUpdateSettings = ({ currentVersion }) => {
  const [status, setStatus] = useState({ state: "idle" });
  const available = isUpdaterAvailable();

  useEffect(() => {
    if (!available) return;
    getUpdateStatus().then(setStatus);
    return onUpdateStatus(setStatus);
  }, [available]);

  const isBusy = status.state === "checking" || status.state === "downloading";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        <RefreshCw size={18} /> Software Update
      </h3>
      <p className="text-sm text-slate-600">
        Currently installed version: <span className="font-medium">{currentVersion || "…"}</span>
      </p>

      {!available ? (
        <p className="text-sm text-slate-400">
          Updates are checked automatically in the installed app - not available in development mode.
        </p>
      ) : (
        <div className="space-y-3">
          {status.state === "idle" && <p className="text-sm text-slate-400">Not checked yet this session.</p>}
          {status.state === "checking" && <p className="text-sm text-slate-500">Checking for updates…</p>}
          {status.state === "up-to-date" && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} /> You're on the latest version.
            </p>
          )}
          {status.state === "downloading" && (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <DownloadCloud size={16} className="text-emerald-600" />
                Downloading update{status.version ? ` v${status.version}` : ""}…
              </p>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${status.percent ?? 0}%` }}
                />
              </div>
            </div>
          )}
          {status.state === "downloaded" && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 size={16} /> Version {status.version} downloaded and ready to install.
              </p>
              <button
                type="button"
                onClick={() => quitAndInstall()}
                className="rounded-lg bg-emerald-700 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-800"
              >
                Restart &amp; Install Now
              </button>
            </div>
          )}
          {status.state === "error" && (
            <p className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle size={16} /> {status.message || "Could not check for updates."}
            </p>
          )}

          {status.state !== "downloaded" && (
            <button
              type="button"
              onClick={() => {
                setStatus({ state: "checking" });
                checkForUpdates();
              }}
              disabled={isBusy}
              className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              Check for Updates
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SoftwareUpdateSettings;
