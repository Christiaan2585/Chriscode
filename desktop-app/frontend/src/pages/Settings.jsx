import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Landmark, Database, ShieldCheck, Users as UsersIcon, UserPlus, Trash2, UploadCloud, Package, Users, ClipboardList, RefreshCw, CheckCircle2, DownloadCloud, AlertTriangle, FolderOpen } from "lucide-react";
import apiClient from "../api/client";
import { authService } from "../api/authService";
import { useAuth } from "../context/AuthContext";
import ImportModal from "../components/ImportModal";
import { isUpdaterAvailable, checkForUpdates, quitAndInstall, getUpdateStatus, onUpdateStatus } from "../utils/updater";
import { canChooseFolder, canOpenFolder, chooseFolder, openFolder } from "../utils/desktop";

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

const IMPORT_TYPES = {
  products: {
    label: "Products",
    icon: Package,
    endpoint: "/products/import",
    columnHint: "Supplier price-list columns: Product name, Product code, Unit pack size, Units per carton, Unit Price (cost), Selling Price Excl VAT, Selling Price Incl VAT.",
    invalidateKeys: [["products"]],
    createdLabel: "created",
    updatedLabel: "updated",
  },
  clients: {
    label: "Clients",
    icon: Users,
    endpoint: "/clients/import",
    columnHint: "Recognises common column names like Name, Email, Phone, Address, Farm Name - in any order.",
    invalidateKeys: [["clients"]],
    createdLabel: "created",
    updatedLabel: "updated",
  },
  programs: {
    label: "Herding Programs",
    icon: ClipboardList,
    endpoint: "/programs/import",
    columnHint: "One row per animal type: Client (name or email), Program Name, Animal Type, Count. Goal/Start Date/End Date are optional. The client must already exist.",
    invalidateKeys: [["programs"]],
    createdLabel: "programs created",
    updatedLabel: "animal groups added or changed",
  },
};

const DataImportSettings = () => {
  const [openImport, setOpenImport] = useState(null);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        <UploadCloud size={18} /> Import from Excel / CSV
      </h3>
      <p className="text-sm text-slate-500">
        Bulk-load existing spreadsheets instead of typing everything in by hand.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(IMPORT_TYPES).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOpenImport(key)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
          >
            <cfg.icon size={16} className="text-emerald-600" />
            {cfg.label}
          </button>
        ))}
      </div>

      {Object.entries(IMPORT_TYPES).map(([key, cfg]) => (
        <ImportModal
          key={key}
          isOpen={openImport === key}
          onClose={() => setOpenImport(null)}
          title={`Import ${cfg.label}`}
          endpoint={cfg.endpoint}
          columnHint={cfg.columnHint}
          invalidateKeys={cfg.invalidateKeys}
          createdLabel={cfg.createdLabel}
          updatedLabel={cfg.updatedLabel}
        />
      ))}
    </div>
  );
};

const SecuritySettings = () => {
  const { user, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState(null);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", is_admin: false });
  const [addUserMsg, setAddUserMsg] = useState(null);

  const { data: users } = useQuery({
    queryKey: ["auth-users"],
    queryFn: authService.listUsers,
    enabled: !!user?.is_admin,
    retry: false,
  });

  const changePin = useMutation({
    mutationFn: (pin) => authService.setupPin(pin),
    onSuccess: () => {
      setPinMsg("PIN updated.");
      setNewPin("");
      refreshMe();
    },
    onError: (err) => setPinMsg(err.response?.data?.detail || "Could not update PIN."),
  });

  const addUser = useMutation({
    mutationFn: (payload) => authService.addUser(payload),
    onSuccess: () => {
      setAddUserMsg(null);
      setNewUser({ name: "", email: "", password: "", is_admin: false });
      queryClient.invalidateQueries({ queryKey: ["auth-users"] });
    },
    onError: (err) => setAddUserMsg(err.response?.data?.detail || "Could not add user."),
  });

  const deactivateUser = useMutation({
    mutationFn: (id) => authService.deactivateUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth-users"] }),
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        <ShieldCheck size={18} /> Security
      </h3>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Signed in as</p>
        <p className="text-sm text-slate-600">{user?.name} ({user?.email}){user?.is_admin ? " - admin" : ""}</p>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{5}$/.test(newPin)) {
            setPinMsg("PIN must be exactly 5 digits.");
            return;
          }
          changePin.mutate(newPin);
        }}
      >
        <p className="text-sm font-medium text-slate-700">Change your 5-digit PIN</p>
        <p className="text-xs text-slate-400">This is the code you enter to get back into the app on this computer.</p>
        <div className="flex items-center gap-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-32 tracking-widest"
            inputMode="numeric"
            maxLength={5}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 5))}
          />
          <button type="submit" className="rounded-lg bg-emerald-700 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-800 disabled:opacity-50" disabled={changePin.isPending}>
            Update PIN
          </button>
        </div>
        {pinMsg && <p className="text-xs text-slate-500">{pinMsg}</p>}
      </form>

      {user?.is_admin && (
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <UsersIcon size={16} /> Staff accounts
          </p>
          <ul className="text-sm text-slate-600 space-y-1">
            {(users || []).map((u) => (
              <li key={u.id} className="flex items-center justify-between">
                <span>
                  {u.name} ({u.email}){u.is_admin ? " - admin" : ""}
                </span>
                {u.id !== user.id && (
                  <button
                    type="button"
                    title="Deactivate"
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => deactivateUser.mutate(u.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <form
            className="grid grid-cols-2 gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              addUser.mutate(newUser);
            }}
          >
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
              placeholder="Full name"
              required
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            />
            <input
              type="email"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
              placeholder="Email"
              required
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
            <input
              type="password"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
              placeholder="Temporary password"
              required
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
            <label className="flex items-center gap-2 text-xs text-slate-500 col-span-2">
              <input
                type="checkbox"
                checked={newUser.is_admin}
                onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
              />
              Make this person an admin too
            </label>
            <button
              type="submit"
              className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-700 text-white text-sm font-medium py-2 hover:bg-emerald-800 disabled:opacity-50"
              disabled={addUser.isPending}
            >
              <UserPlus size={14} /> Add teammate
            </button>
            {addUserMsg && <p className="col-span-2 text-xs text-red-500">{addUserMsg}</p>}
            <p className="col-span-2 text-xs text-slate-400">
              They'll sign in with this email and password, then choose their own 5-digit PIN and can sign in with
              Google afterwards if it's the same email address.
            </p>
          </form>
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const { data: version, isLoading } = useQuery({
    queryKey: ["version"],
    queryFn: async () => {
      const response = await apiClient.get("/version");
      return response.data;
    },
    retry: false,
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-3xl font-bold text-slate-800">Settings</h2>
        <p className="text-slate-500">App information and business configuration</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <Info size={18} /> App Info
        </h3>
        {isLoading ? (
          <p className="text-sm text-slate-400">Checking version...</p>
        ) : version ? (
          <div className="text-sm text-slate-600 space-y-1">
            <p><span className="font-medium">Name:</span> {version.app_name}</p>
            <p><span className="font-medium">Version:</span> {version.version}</p>
            {version.last_updated && (
              <p><span className="font-medium">Last updated:</span> {version.last_updated}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-red-500">Couldn't reach the backend to check the version.</p>
        )}
      </div>

      <SoftwareUpdateSettings currentVersion={version?.version} />

      <SecuritySettings />

      <DataImportSettings />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <Landmark size={18} /> Business Configuration
        </h3>
        <div className="text-sm text-slate-600 space-y-1">
          <p><span className="font-medium">Currency:</span> ZAR</p>
          <p><span className="font-medium">VAT:</span> 15%</p>
          <p><span className="font-medium">Date format:</span> DD/MM/YYYY</p>
          <p><span className="font-medium">Units:</span> Metric (ml / L / kg)</p>
        </div>
        <p className="text-xs text-slate-400">
          These reflect how pricing and dates are currently calculated. Making them editable from here is planned but not built yet.
        </p>
      </div>

      <BackupSettings databasePath={version?.database_path} />
    </div>
  );
};

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatWhen = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const BackupSettings = ({ databasePath }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [folderInput, setFolderInput] = useState("");
  const [message, setMessage] = useState(null);

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

  const restore = useMutation({
    mutationFn: async (name) => (await apiClient.post("/backups/restore", { name })).data,
    // Everything cached in the app (and possibly the signed-in account
    // itself) now reflects the restored data, so start fresh.
    onSuccess: () => window.location.reload(),
  });

  const confirmRestore = (b) => {
    const ok = window.confirm(
      `Restore the backup from ${formatWhen(b.created_at)}?\n\n` +
      "Everything entered after that time will be replaced. A copy of your current data is saved first, " +
      "so you can undo this by restoring that copy.\n\nThe app will reload and you may need to sign in again."
    );
    if (ok) restore.mutate(b.name);
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

          {status.backups.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Recent backups ({status.backups.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {status.backups.slice(0, 10).map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-4">
                    <span>{formatWhen(b.created_at)}</span>
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
    </div>
  );
};

export default Settings;
