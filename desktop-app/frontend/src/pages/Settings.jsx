import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Landmark, Database, ShieldCheck, Users as UsersIcon, UserPlus, Trash2, UploadCloud, Package, Users, ClipboardList } from "lucide-react";
import apiClient from "../api/client";
import { authService } from "../api/authService";
import { useAuth } from "../context/AuthContext";
import ImportModal from "../components/ImportModal";

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
    updatedLabel: "animal groups added",
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <Database size={18} /> Data
        </h3>
        {version?.database_path ? (
          <p className="text-sm text-slate-600">
            Your data lives at{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs break-all">{version.database_path}</code>.
            Back this file up before any update if you want to be safe.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Your data lives in <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">kyron_agri.db</code>.
            Back this file up before any update if you want to be safe.
          </p>
        )}
      </div>
    </div>
  );
};

export default Settings;
