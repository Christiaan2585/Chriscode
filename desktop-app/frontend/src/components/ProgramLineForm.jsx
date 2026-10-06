import React, { useId, useState } from "react";
import SearchableSelect from "./SearchableSelect";
import { GROUPS, splitGroups } from "../utils/herding";
import { pickerProducts } from "../utils/products";

const inputClass =
  "rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

// The cost sheet's second column - suggestions only, anything can be typed.
const CATEGORIES = ["Enting", "Dosering", "Minerale", "Bosluis behandeling", "Ander behandeling"];

const draftFrom = (line) => ({
  product_id: line?.product_id ?? "",
  mode: line?.fixed_quantity ? "fixed" : "dose",
  groups: splitGroups(line?.animal_group),
  dose: line?.dose ?? "",
  fixed_quantity: line?.fixed_quantity ?? "",
  category: line?.category || "",
  note: line?.note || "",
});

// A herding program's product line: which product, per animal (for which
// groups - none ticked = every animal) or a fixed number of packs (the
// medicine box), plus the cost sheet's category and a note.
const ProgramLineForm = ({ line, products, submitLabel = "Save", onSubmit, onCancel }) => {
  const [draft, setDraft] = useState(() => draftFrom(line));
  const [saving, setSaving] = useState(false);
  const modeName = useId();
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const chosen = products.find((p) => p.id === Number(draft.product_id));
  // Group names on an older line that aren't one of the five stay tickable.
  const names = [...GROUPS, ...draft.groups.filter((g) => !GROUPS.some((n) => n.toLowerCase() === g.toLowerCase()))];
  const ticked = (name) => draft.groups.some((g) => g.toLowerCase() === name.toLowerCase());
  const tick = (name, on) =>
    setDraft({ ...draft, groups: on ? [...draft.groups, name] : draft.groups.filter((g) => g.toLowerCase() !== name.toLowerCase()) });
  const number = (v) => (v === "" || v === null ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    const fixed = draft.mode === "fixed";
    setSaving(true);
    try {
      await onSubmit({
        product_id: Number(draft.product_id),
        animal_group: fixed ? null : names.filter(ticked).join(", ") || null,
        dose: fixed ? null : number(draft.dose),
        fixed_quantity: fixed ? number(draft.fixed_quantity) : null,
        category: draft.category.trim() || null,
        note: draft.note.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-emerald-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <SearchableSelect value={draft.product_id} onChange={(v) => setDraft({ ...draft, product_id: v })}
            options={pickerProducts(products, draft.product_id).map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))}
            placeholder="Choose a product…" searchPlaceholder="Search products…" />
        </div>
        <input list={`${modeName}-categories`} aria-label="Category" placeholder="Category, e.g. Enting"
          className={`${inputClass} w-44`} value={draft.category} onChange={set("category")} />
        <datalist id={`${modeName}-categories`}>{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
        <legend className="sr-only">How much</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name={modeName} className="accent-emerald-600" checked={draft.mode === "dose"}
            onChange={() => setDraft({ ...draft, mode: "dose" })} />
          <input type="number" min="0" step="any" aria-label="Dose per animal" placeholder="Dose" disabled={draft.mode !== "dose"}
            className={`${inputClass} w-24`} value={draft.dose} onChange={set("dose")} />
          {chosen?.unit || "ml"} per animal
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={modeName} className="accent-emerald-600" checked={draft.mode === "fixed"}
            onChange={() => setDraft({ ...draft, mode: "fixed" })} />
          <input type="number" min="0" step="any" aria-label="Number of packs" placeholder="Packs" disabled={draft.mode !== "fixed"}
            className={`${inputClass} w-20`} value={draft.fixed_quantity} onChange={set("fixed_quantity")} />
          packs, whatever the headcount (medicine box)
        </label>
      </fieldset>

      {draft.mode === "dose" && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            For {draft.groups.length ? "" : "(none ticked = every animal)"}
          </legend>
          {names.map((name) => (
            <label key={name} className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={ticked(name)}
                onChange={(e) => tick(name, e.target.checked)} />
              {name}
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Note" placeholder="Note, e.g. onderhuids" className={`${inputClass} min-w-[12rem] flex-1`}
          value={draft.note} onChange={set("note")} />
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800">
          Cancel
        </button>
        <button type="submit" disabled={!draft.product_id || saving}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default ProgramLineForm;
