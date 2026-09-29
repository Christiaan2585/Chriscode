import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ChevronDown, Landmark, Save, UserRound } from "lucide-react";
import apiClient from "../api/client";
import Avatar from "./Avatar";
import BusinessSettings from "./BusinessSettings";
import { checkPictureFile } from "./ProductPicture";

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

// The user's own profile photo - shown in the header, on the lock screen and
// in the staff list. The server crops it to a square.
const MyPhoto = ({ user, onSaved }) => {
  const [problem, setProblem] = useState(null);
  const change = useMutation({
    mutationFn: async (file) => {
      if (!file) return (await apiClient.delete("/auth/me/photo")).data;
      const form = new FormData();
      form.append("file", file);
      return (await apiClient.put("/auth/me/photo", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: (data) => onSaved(data),
  });
  const pick = (file) => {
    if (!file) return;
    const error = checkPictureFile(file);
    setProblem(error);
    if (!error) change.mutate(file);
  };
  const uploaded = user.avatar_url?.startsWith("data:");

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar user={user} size="xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:text-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500 ${change.isPending ? "pointer-events-none opacity-50" : ""}`}>
            <Camera size={16} /> {user.avatar_url ? "Change photo" : "Add a photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={change.isPending}
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {uploaded && (
            <button type="button" disabled={change.isPending} onClick={() => change.mutate(null)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">
              Remove photo
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{change.isPending ? "Saving…" : "JPG, PNG or WEBP. The middle square is used."}</p>
        {problem && <p role="alert" className="text-sm text-red-600">{problem}</p>}
      </div>
    </div>
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
    {user ? (
      <>
        <MyPhoto user={user} onSaved={onSaved} />
        <MyDetailsForm key={user.id} user={user} onSaved={onSaved} />
        <CompanyDetails canEdit={Boolean(user.is_admin)} />
      </>
    ) : null}
  </div>
);

// The business's own details (printed on every invoice) as a drop-down under
// the user's details. Opens by itself while something required is missing.
const CompanyDetails = ({ canEdit }) => {
  const { data } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await apiClient.get("/business/")).data,
  });
  const missing = data?.missing || [];
  const [open, setOpen] = useState(null); // null = not touched yet: follow `missing`
  const isOpen = open ?? missing.length > 0;

  return (
    <details id="business-details" open={isOpen} onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-lg border border-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
        <Landmark size={16} aria-hidden="true" />
        <span className="whitespace-nowrap">Company details (advanced)</span>
        {missing.length > 0 && (
          <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{missing.length} missing</span>
        )}
        <span className="ml-auto hidden truncate text-xs font-normal text-slate-500 xl:inline">
          VAT and registration, addresses, banking, invoice numbers
        </span>
      </summary>
      <div className="border-t border-slate-200 p-4">
        <p className="mb-4 text-sm text-slate-500">Printed on every invoice, quote and purchase order.</p>
        {isOpen && <BusinessSettings canEdit={canEdit} bare />}
      </div>
    </details>
  );
};

export default MyDetails;
