import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Tag, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { shortDate } from "../utils/format";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm";
const iconButton = "flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-700 sm:h-9 sm:w-9";

const detailOf = (error) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : "That did not work. Please try again.";
};

// "7 months", "2 years 3 months" from a birth date.
export const ageOf = (iso, now = new Date()) => {
  if (!iso) return null;
  const born = new Date(iso);
  if (Number.isNaN(born.getTime())) return null;
  let months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth();
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} ${rest === 1 ? "month" : "months"}`;
  return rest ? `${years} ${years === 1 ? "year" : "years"} ${rest} ${rest === 1 ? "month" : "months"}` : `${years} ${years === 1 ? "year" : "years"}`;
};

const EMPTY = { tag_id: "", name: "", breed: "", birth_date: "", notes: "" };
const dateInput = (iso) => (iso ? String(iso).slice(0, 10) : "");

// The farm's rams, each with its ear-tag number. Type a tag and press Add for the quick case; the pencil
// opens the other details (name, breed, birth date, notes).
const RamsPanel = ({ clientId }) => {
  const queryClient = useQueryClient();
  const key = ["rams", "client", String(clientId)];
  const { data: rams = [], isLoading } = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get(`/rams/client/${clientId}`)).data });
  const [quickTag, setQuickTag] = useState("");
  const [quickError, setQuickError] = useState(null);
  const [editing, setEditing] = useState(null); // a ram being edited, or null
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState(null);
  const [search, setSearch] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["rams"] });
  const add = useMutation({
    mutationFn: async (data) => (await apiClient.post("/rams/", { client_id: Number(clientId), ...data }, { silent: true })).data,
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: async ({ id, changes }) => (await apiClient.patch(`/rams/${id}`, changes, { silent: true })).data,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/rams/${id}`, { silent: true })).data,
    onSuccess: refresh,
  });

  const quickAdd = async (event) => {
    event.preventDefault();
    setQuickError(null);
    if (!quickTag.trim()) return setQuickError("Type the ram's ear-tag number first.");
    try {
      await add.mutateAsync({ tag_id: quickTag });
      setQuickTag("");
    } catch (error) {
      setQuickError(detailOf(error));
    }
  };

  const openEdit = (ram) => {
    setEditing(ram);
    setFormError(null);
    setForm({ tag_id: ram.tag_id || "", name: ram.name || "", breed: ram.breed || "", birth_date: dateInput(ram.birth_date), notes: ram.notes || "" });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    setFormError(null);
    try {
      // Every box is sent, so clearing one clears it; a name left empty goes back to "Ram <tag>".
      await save.mutateAsync({ id: editing.id, changes: { tag_id: form.tag_id, name: form.name, breed: form.breed, birth_date: form.birth_date || null, notes: form.notes } });
      setEditing(null);
    } catch (error) {
      setFormError(detailOf(error));
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rams.filter((r) => [r.tag_id, r.name, r.breed, r.notes].some((f) => f && String(f).toLowerCase().includes(q))) : rams;
  }, [rams, search]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 border-b pb-2 text-lg font-semibold">
        <Tag size={18} className="text-emerald-600" /> Rams
        <span className="text-sm font-normal text-slate-400">{rams.length ? `${rams.length} tagged` : ""}</span>
      </h3>

      <form onSubmit={quickAdd} className="flex gap-2">
        <input className={`${input} font-mono tracking-wide`} value={quickTag} onChange={(e) => { setQuickTag(e.target.value); setQuickError(null); }}
          placeholder="Ear-tag number" aria-label="Ear-tag number of a new ram" maxLength={40} autoCapitalize="characters" />
        <button type="submit" disabled={add.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
          <Plus size={16} /> Add ram
        </button>
      </form>
      {quickError && <p role="alert" className="mt-2 text-sm text-red-600">{quickError}</p>}

      {rams.length > 6 && (
        <input className={`${input} mt-3`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a tag, name or breed..." aria-label="Find a ram" />
      )}

      <ul className="mt-3 divide-y divide-slate-100">
        {isLoading ? <li className="py-3 text-sm text-slate-400">Loading...</li> : shown.length === 0 ? (
          <li className="py-3 text-sm text-slate-400">{rams.length ? "No ram matches." : "No rams tagged yet. Type an ear-tag number above to add the first one."}</li>
        ) : shown.map((ram) => {
          const age = ageOf(ram.birth_date);
          const details = [ram.breed, ram.birth_date ? `born ${shortDate(ram.birth_date)}${age ? ` (${age})` : ""}` : null].filter(Boolean).join(" · ");
          return (
            <li key={ram.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 shrink-0 rounded-md bg-emerald-50 px-2 py-1 font-mono text-sm font-bold tracking-wide text-emerald-800">{ram.tag_id}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{ram.name}</p>
                {details && <p className="text-sm text-slate-500">{details}</p>}
                {ram.notes && <p className="whitespace-pre-line text-sm text-slate-500">{ram.notes}</p>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button type="button" className={iconButton} onClick={() => openEdit(ram)} aria-label={`Edit ram ${ram.tag_id}`} title="Edit"><Edit size={16} /></button>
                <button type="button" className={`${iconButton} hover:text-red-600`} aria-label={`Delete ram ${ram.tag_id}`} title="Delete"
                  onClick={() => { if (window.confirm(`Delete ram ${ram.tag_id}${ram.name && ram.name !== `Ram ${ram.tag_id}` ? ` (${ram.name})` : ""}? This can't be undone.`)) remove.mutate(ram.id); }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {remove.isError && <p role="alert" className="mt-2 text-sm text-red-600">{detailOf(remove.error)}</p>}

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `Ram ${editing.tag_id}` : "Ram"}>
        <form onSubmit={saveEdit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Ear-tag number
            <input className={`${input} mt-1 font-mono`} value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} maxLength={40} required />
          </label>
          <label className="block text-sm font-medium text-slate-700">Name (optional)
            <input className={`${input} mt-1`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Breed
              <input className={`${input} mt-1`} value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} maxLength={80} placeholder="e.g. Dorper" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Birth date
              <input type="date" className={`${input} mt-1`} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Notes
            <textarea rows={3} className={`${input} mt-1`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} placeholder="Where he came from, his sire, anything worth remembering" />
          </label>
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button type="submit" disabled={save.isPending} className="w-full rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {save.isPending ? "Saving..." : "Save ram"}
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default RamsPanel;
