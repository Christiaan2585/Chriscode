import React, { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteMany } from "../utils/useSelection";

const box = "h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600";

// The tick box in a table's header row: ticks or clears everything shown.
export const SelectAllTh = ({ selection, label = "Select all" }) => (
  <th className="w-10 px-4 py-3">
    <input type="checkbox" className={box} aria-label={label} checked={selection.allSelected}
      ref={(el) => { if (el) el.indeterminate = selection.count > 0 && !selection.allSelected; }}
      onChange={selection.toggleAll} onClick={(e) => e.stopPropagation()} />
  </th>
);

// The tick box at the start of a row.
export const SelectTd = ({ selection, id, label }) => (
  <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
    <input type="checkbox" className={box} aria-label={label} checked={selection.has(id)} onChange={() => selection.toggle(id)} />
  </td>
);

// A tick box for a card (the product catalog).
export const SelectBox = ({ selection, id, label, className = "" }) => (
  <input type="checkbox" className={`${box} ${className}`} aria-label={label} checked={selection.has(id)} onChange={() => selection.toggle(id)} />
);

// Appears once something is ticked: "3 selected - Delete selected". Asks first,
// deletes one by one with `deleteOne(id)`, and says what couldn't be deleted.
// `describe(id)` names a record for that list; `onDone` refreshes the page.
export const BulkBar = ({ selection, noun, deleteOne, describe, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    const ids = selection.selected;
    const plural = ids.length === 1 ? noun : `${noun}s`;
    if (!window.confirm(`Delete ${ids.length} ${plural}? This can't be undone.`)) return;
    setBusy(true);
    const outcome = await deleteMany(ids, deleteOne);
    setBusy(false);
    setResult({ ...outcome, noun, describe });
    selection.clear();
    onDone?.();
  };

  return (
    <>
      {selection.count > 0 && (
        <div role="region" aria-label="Selected" className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          <span className="font-medium">{selection.count} selected</span>
          <button type="button" onClick={run} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-50">
            <Trash2 size={14} /> {busy ? "Deleting…" : "Delete selected"}
          </button>
          <button type="button" onClick={selection.clear} disabled={busy} className="flex items-center gap-1 text-emerald-800 hover:underline">
            <X size={14} /> Clear
          </button>
        </div>
      )}
      {result && (
        <div role="status" className={`rounded-xl border px-4 py-2 text-sm ${result.failed.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <div className="flex items-start justify-between gap-3">
            <p>
              Deleted {result.deleted} {result.deleted === 1 ? result.noun : `${result.noun}s`}
              {result.failed.length > 0 && <>; {result.failed.length} couldn't be deleted:</>}
            </p>
            <button type="button" onClick={() => setResult(null)} aria-label="Dismiss" className="text-slate-500 hover:text-slate-800"><X size={14} /></button>
          </div>
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {result.failed.map((f) => <li key={f.id}><b>{result.describe ? result.describe(f.id) : `#${f.id}`}</b> - {f.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
};
