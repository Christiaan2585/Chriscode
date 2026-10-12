import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, DownloadCloud, RefreshCw } from "lucide-react";
import { CHECKED_KEY, shouldCheckNow } from "../utils/androidUpdate";
import { useAndroidUpdate } from "../utils/useAndroidUpdate";

const megabytes = (bytes) => (bytes ? ` (${(bytes / 1048576).toFixed(1)} MB)` : "");

// What to say for each step of an update; shared by the pop-up and the Settings card.
const Status = ({ u }) => {
  if (u.phase === "downloading") {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm text-slate-600"><DownloadCloud size={16} className="text-emerald-600" /> Downloading version {u.update?.version}...</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${u.percent}%` }} /></div>
      </div>
    );
  }
  if (u.phase === "installing") return <p className="text-sm text-slate-600">Android will now ask you to confirm. Tap <b>Install</b>; the app restarts on the new version.</p>;
  if (u.phase === "needs-permission") {
    return (
      <p className="text-sm text-slate-600">
        Android needs your OK once: in the screen that opened, switch on <b>Allow from this source</b> for Sandveld, come back here and tap <b>Install</b>.
      </p>
    );
  }
  if (u.phase === "error") return <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle size={16} /> {u.message}</p>;
  return null;
};

const primary = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
const quiet = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

// Settings -> General on the phone: the counterpart of the PC's "Software Update" card.
export const AndroidUpdateSettings = () => {
  const u = useAndroidUpdate();
  useEffect(() => { u.check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800"><RefreshCw size={18} /> Software Update</h3>
      <p className="text-sm text-slate-600">Installed version: <span className="font-medium">{u.current || "..."}</span></p>
      {u.phase === "checking" && <p className="text-sm text-slate-500">Checking for updates...</p>}
      {u.phase === "up-to-date" && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> You're on the latest version.</p>}
      {u.phase === "available" && <p className="text-sm text-slate-700">Version <b>{u.update.version}</b> is available{megabytes(u.update.size)}.</p>}
      <Status u={u} />
      <div className="flex flex-wrap gap-2">
        {u.phase === "available" && <button type="button" className={primary} onClick={() => u.start(u.update)}>Download and install</button>}
        {u.phase === "needs-permission" && <button type="button" className={primary} onClick={u.install}>Install</button>}
        <button type="button" className={quiet} disabled={busy} onClick={u.check}>Check for updates</button>
      </div>
      <p className="text-xs text-slate-400">Updates come from the same GitHub releases as the PC version. Android always asks you before it installs one.</p>
    </div>
  );
};

// Once per launch (and at most every six hours): if a newer version is out, offer it. "Later" just closes it - Settings can always do it.
export const AndroidUpdatePrompt = () => {
  const u = useAndroidUpdate();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let last = null;
    try { last = localStorage.getItem(CHECKED_KEY); } catch { /* ask */ }
    if (shouldCheckNow(last)) u.check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const offered = ["available", "downloading", "installing", "needs-permission", "error"].includes(u.phase) && u.update;
  if (dismissed || !offered) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="android-update-title" className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 id="android-update-title" className="text-lg font-semibold text-slate-800">Update available</h2>
        <p className="text-sm text-slate-600">
          Sandveld Vee Dienste <b>{u.update.version}</b> is ready{megabytes(u.update.size)}. Your clients and quotes stay as they are.
        </p>
        <Status u={u} />
        <div className="flex justify-end gap-2">
          {u.phase !== "downloading" && <button type="button" className={quiet} onClick={() => setDismissed(true)}>Later</button>}
          {u.phase === "available" && <button type="button" className={primary} onClick={() => u.start(u.update)}>Update now</button>}
          {u.phase === "needs-permission" && <button type="button" className={primary} onClick={u.install}>Install</button>}
          {u.phase === "error" && <button type="button" className={primary} onClick={() => u.start(u.update)}>Try again</button>}
        </div>
      </div>
    </div>
  );
};
