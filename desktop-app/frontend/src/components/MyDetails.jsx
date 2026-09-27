import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Save, UserRound } from "lucide-react";
import apiClient from "../api/client";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500";

// The signed-in user's own details - printed as the sales rep on the
// invoices, quotes and purchase orders they create.
const MyDetailsForm = ({ user, onSaved }) => {
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async () => (await apiClient.put("/auth/me", { name, phone: phone || null })).data,
    onSuccess: async (data) => {
      setSaved(true);
      await onSaved(data);
    },
  });
  const dirty = name !== (user.name || "") || phone !== (user.phone || "");

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input className={inputClass} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
          <input className={inputClass} value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="e.g. 084 870 0207" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email (sign-in)</span>
          <input className={inputClass} value={user.email} disabled />
        </label>
      </div>
      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && <span role="status" className="text-sm text-emerald-600">Saved</span>}
        <button type="submit" disabled={!dirty || !name.trim() || save.isPending}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50">
          <Save size={16} /> {save.isPending ? "Saving…" : "Save my details"}
        </button>
      </div>
    </form>
  );
};

const MyDetails = ({ user, onSaved }) => (
  <div id="my-details" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
    <h3 className="flex items-center gap-2 font-semibold text-slate-800">
      <UserRound size={18} /> My Details
    </h3>
    <p className="text-sm text-slate-500">
      Your name and phone number are printed as the sales rep on invoices, quotes and purchase orders you create.
    </p>
    {user ? <MyDetailsForm key={user.id} user={user} onSaved={onSaved} /> : null}
  </div>
);

export default MyDetails;
