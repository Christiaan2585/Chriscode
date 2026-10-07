import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, CheckCircle2, AlertTriangle, FolderOpen, Lock } from "lucide-react";
import Modal from "../Modal";
import { detailOf } from "./security/shared";
import apiClient from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { canChooseFolder, canOpenFolder, chooseFolder, openFolder } from "../../utils/desktop";

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatWhen = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const BackupSettings = ({ databasePath }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [folderInput, setFolderInput] = useState("");
  const [message, setMessage] = useState(null);
  const [passphrase, setPassphrase] = useState({ one: "", two: "" });
  const [lockMessage, setLockMessage] = useState(null);
  const [unlocking, setUnlocking] = useState(null); // {backup, passphrase} - restoring a locked backup

  const isAdmin = !!user?.is_admin;
  const { data: status, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => (await apiClient.get("/backups/")).data,
    enabled: isAdmin,
  });

  const runNow = useMutation({
    mutationFn: async () => (await apiClient.post("/backups/run")).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["backups"], data);
      setMessage(data.last_extra_error ? null : "Backup complete.");
    },
  });

  const saveFolder = useMutation({
    mutationFn: async (extra_folder) =>
      (await apiClient.put("/backups/settings", { extra_folder, keep: status.settings.keep })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["backups"], data);
      setFolderInput("");
      setMessage(data.settings.extra_folder ? "Extra backup folder saved - backing up there now." : "Extra backup folder removed.");
      if (data.settings.extra_folder) runNow.mutate();
    },
  });

  const lock = useMutation({
    mutationFn: async (value) => (await apiClient.put("/backups/encryption", { passphrase: value })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["backups"], data);
      setPassphrase({ one: "", two: "" });
      setLockMessage("Backups are locked from now on. Write the passphrase down somewhere safe - you need it to restore on another PC.");
      runNow.mutate();
    },
    onError: (err) => setLockMessage(detailOf(err, "Could not lock the backups.")),
  });
  const unlock = useMutation({
    mutationFn: async () => (await apiClient.delete("/backups/encryption")).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["backups"], data);
      setLockMessage("New backups will not be locked. Locked ones already made still need the passphrase.");
    },
  });

  const restore = useMutation({
    mutationFn: async ({ name, passphrase: typed }) => (await apiClient.post("/backups/restore", { name, passphrase: typed || null })).data,
    // Everything cached in the app (and possibly the signed-in account
    // itself) now reflects the restored data, so start fresh.
    onSuccess: () => window.location.reload(),
    onError: (err) => { if (unlocking) setUnlocking({ ...unlocking, error: detailOf(err, "Could not restore that backup.") }); },
  });

  const confirmRestore = (b) => {
    const ok = window.confirm(
      `Restore the backup from ${formatWhen(b.created_at)}?\n\n` +
      "Everything entered after that time will be replaced. A copy of your current data is saved first, " +
      "so you can undo this by restoring that copy.\n\nThe app will reload and you may need to sign in again."
    );
    if (!ok) return;
    if (b.encrypted) setUnlocking({ backup: b, passphrase: "" }); // locked: ask for the passphrase first
    else restore.mutate({ name: b.name });
  };

  const exportData = useMutation({
    mutationFn: async () => {
      const res = await apiClient.get("/exports/workbook", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sandveld-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  const pickFolder = async () => {
    const folder = await chooseFolder();
    if (folder) saveFolder.mutate(folder);
  };

  const latest = status?.backups?.[0];
  const warning = status?.last_error || status?.last_extra_error;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        <Database size={18} /> Data &amp; Backups
      </h3>

      {databasePath && (
        <p className="text-sm text-slate-600">
          Your data lives at{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs break-all">{databasePath}</code>.
        </p>
      )}

      {!isAdmin ? (
        <p className="text-sm text-slate-500">Your data is backed up automatically every day. Backups are managed by an admin.</p>
      ) : isLoading || !status ? (
        <p className="text-sm text-slate-400">Checking backups...</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm">
              {latest ? (
                <p className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle2 size={16} /> Last backup: {formatWhen(latest.created_at)}
                </p>
              ) : (
                <p className="text-slate-500">No backups yet - the first one runs automatically.</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Backed up automatically once a day while the app is open. The last {status.settings.keep} are kept.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setMessage(null); runNow.mutate(); }}
              disabled={runNow.isPending}
              className="shrink-0 rounded-lg bg-emerald-700 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-800 disabled:opacity-50"
            >
              {runNow.isPending ? "Backing up..." : "Back up now"}
            </button>
          </div>

          {warning && (
            <p className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {warning}
            </p>
          )}
          {message && !warning && <p className="text-xs text-emerald-700">{message}</p>}

          <div className="space-y-1 text-sm">
            <p className="font-medium text-slate-700">On this computer</p>
            <div className="flex items-center gap-2">
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs break-all">{status.backup_dir}</code>
              {canOpenFolder() && (
                <button type="button" onClick={() => openFolder(status.backup_dir)} title="Show in Explorer"
                  className="text-slate-400 hover:text-emerald-700 shrink-0">
                  <FolderOpen size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-700">Extra copy off this computer</p>
            <p className="text-xs text-slate-400">
              Pick a OneDrive / Google Drive folder or a USB drive, so your data survives if this PC is lost or dies.
            </p>
            {status.settings.extra_folder ? (
              <div className="flex items-center gap-2">
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs break-all">{status.extra_backup_dir}</code>
                {canOpenFolder() && (
                  <button type="button" onClick={() => openFolder(status.extra_backup_dir)} title="Show in Explorer"
                    className="text-slate-400 hover:text-emerald-700 shrink-0">
                    <FolderOpen size={16} />
                  </button>
                )}
                <button type="button" onClick={() => saveFolder.mutate(null)}
                  className="text-xs text-slate-400 hover:text-red-500 shrink-0">
                  Remove
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-700">Not set - backups are only on this computer.</p>
            )}
            {canChooseFolder() ? (
              <button type="button" onClick={pickFolder} disabled={saveFolder.isPending}
                className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
                {status.settings.extra_folder ? "Change folder..." : "Choose folder..."}
              </button>
            ) : (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (folderInput.trim()) saveFolder.mutate(folderInput.trim()); }}>
                <input
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. C:\Users\you\OneDrive"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                />
                <button type="submit" disabled={saveFolder.isPending}
                  className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
                  Save
                </button>
              </form>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-slate-700"><Lock size={14} /> Lock backups with a passphrase</p>
            <p className="text-xs text-slate-400">
              Locked backups are unreadable to anyone without the passphrase - so a copy on a USB stick or in OneDrive that is lost or
              stolen gives nothing away. This PC remembers the passphrase for the daily backups (only for your Windows account).
              <b className="text-slate-600"> Write it down somewhere safe: it is the only way to restore on another PC.</b>
            </p>
            {status.settings.encrypted ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} /> Backups are locked</span>
                <button type="button" onClick={() => { if (window.confirm("Stop locking new backups? Backups already locked will still need the passphrase.")) unlock.mutate(); }}
                  className="text-xs text-slate-400 hover:text-red-500">Turn off</button>
              </div>
            ) : (
              <form className="space-y-2" onSubmit={(e) => {
                e.preventDefault();
                if (passphrase.one !== passphrase.two) return setLockMessage("The two passphrases are not the same.");
                setLockMessage(null);
                lock.mutate(passphrase.one);
              }}>
                <input type="password" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Passphrase (at least 12 characters)" autoComplete="new-password"
                  value={passphrase.one} onChange={(e) => setPassphrase({ ...passphrase, one: e.target.value })} />
                <input type="password" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Passphrase again" autoComplete="new-password"
                  value={passphrase.two} onChange={(e) => setPassphrase({ ...passphrase, two: e.target.value })} />
                <button type="submit" disabled={lock.isPending || passphrase.one.length < 12}
                  className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
                  {lock.isPending ? "Locking..." : "Lock backups"}
                </button>
              </form>
            )}
            {lockMessage && <p role="status" className="text-xs text-slate-600">{lockMessage}</p>}
          </div>

          {status.backups.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Recent backups ({status.backups.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {status.backups.slice(0, 10).map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1">{formatWhen(b.created_at)}{b.encrypted && <Lock size={11} aria-label="Locked" />}</span>
                    <span className="flex items-center gap-3">
                      {formatSize(b.size)}
                      <button type="button" onClick={() => confirmRestore(b)} disabled={restore.isPending}
                        className="text-emerald-700 hover:underline disabled:opacity-50">
                        Restore
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              Everything except logins, in one Excel file - for your accountant or your own records.
            </p>
            <button type="button" onClick={() => exportData.mutate()} disabled={exportData.isPending}
              className="shrink-0 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
              {exportData.isPending ? "Exporting..." : "Export to Excel"}
            </button>
          </div>
          {restore.isPending && <p className="text-xs text-slate-500">Restoring...</p>}
        </>
      )}
      <Modal isOpen={!!unlocking} onClose={() => setUnlocking(null)} title="This backup is locked">
        {unlocking && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); restore.mutate({ name: unlocking.backup.name, passphrase: unlocking.passphrase }); }}>
            <p className="text-sm text-slate-600">Type the backup passphrase. Leave it empty to use the one saved on this PC.</p>
            <input type="password" autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={unlocking.passphrase}
              onChange={(e) => setUnlocking({ ...unlocking, passphrase: e.target.value, error: null })} />
            {unlocking.error && <p role="alert" className="text-sm text-red-600">{unlocking.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setUnlocking(null)}>Cancel</button>
              <button type="submit" disabled={restore.isPending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">Restore</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default BackupSettings;
