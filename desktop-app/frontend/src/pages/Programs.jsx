import React, { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileSpreadsheet, Plus, Save, Trash2, X } from "lucide-react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import InlineEdit from "../components/InlineEdit";
import SearchableSelect from "../components/SearchableSelect";
import { ANCHOR_LABELS, TEXT_COLUMNS, dayLabel, ruleText } from "../utils/herding";
import { pickerProducts } from "../utils/products";

const inputClass =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const primary =
  "flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50";
const secondary =
  "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-50";

const TEMPLATE_KEY = ["program-template"];

// Lambing, season and weaning defaults every client's program starts from.
const SettingsForm = ({ settings, canEdit }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(settings);
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const save = useMutation({
    mutationFn: async () => (await apiClient.put("/programs/template", {
      name: draft.name,
      gestation_days: Number(draft.gestation_days),
      mating_weeks: Number(draft.mating_weeks),
      weaning_rule: draft.weaning_rule,
      weaning_months: Number(draft.weaning_months),
      weaning_days: Number(draft.weaning_days),
    })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATE_KEY }),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const number = (key, label, min, max) => (
    <input type="number" min={min} max={max} aria-label={label} className={`${inputClass} w-20 py-1`}
      value={draft[key]} onChange={set(key)} />
  );

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <fieldset disabled={!canEdit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name (printed on the farmer's PDF)</span>
          <input required className={`${inputClass} w-full max-w-md`} value={draft.name} onChange={set("name")} />
        </label>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          Lambing starts {number("gestation_days", "Days from first mating to lambing", 100, 320)} days after the first mating day.
          Mating season: {number("mating_weeks", "Mating season in weeks", 1, 52)} weeks.
        </p>
        <div className="space-y-1 text-sm text-slate-700">
          <span className="font-medium">Weaning day, unless a program says otherwise:</span>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="template_weaning" aria-label="Wean by age" className="accent-emerald-600" checked={draft.weaning_rule === "age"}
              onChange={() => setDraft({ ...draft, weaning_rule: "age" })} />
            lambs weaned at {number("weaning_months", "Weaning age in months", 1, 12)} months (after lambing starts)
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="template_weaning" aria-label="Wean a set number of days after the first mating day" className="accent-emerald-600" checked={draft.weaning_rule === "fixed"}
              onChange={() => setDraft({ ...draft, weaning_rule: "fixed" })} />
            {number("weaning_days", "Days from first mating to weaning", 30, 720)} days after the first mating day (the Excel sheet's rule)
          </label>
        </div>
      </fieldset>
      {canEdit && (
        <div className="flex justify-end">
          <button type="submit" disabled={!dirty || save.isPending} className={primary}>
            <Save size={16} /> {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </form>
  );
};

// "8 weeks before the first mating day" - edited as a number of days plus an anchor.
const StepTiming = ({ step, canEdit, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(Math.abs(step.offset_days));
  const [direction, setDirection] = useState(step.offset_days < 0 ? -1 : 1);
  const [anchor, setAnchor] = useState(step.anchor);
  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800">{ruleText(step.anchor, step.offset_days)}</span>
        {step.date && <span className="text-sm text-slate-500">({dayLabel(step.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })})</span>}
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-emerald-700 hover:underline">
            Change timing
          </button>
        )}
      </span>
    );
  }
  return (
    <form className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave({ anchor, offset_days: direction * Number(days || 0) });
        setEditing(false);
      }}>
      <input type="number" min="0" max="800" aria-label="Days" className={`${inputClass} w-20 py-1`} value={days}
        onChange={(e) => setDays(e.target.value)} />
      days
      <select aria-label="Before or after" className={`${inputClass} py-1`} value={direction} onChange={(e) => setDirection(Number(e.target.value))}>
        <option value={-1}>before</option>
        <option value={1}>after</option>
      </select>
      <select aria-label="From" className={`${inputClass} py-1`} value={anchor} onChange={(e) => setAnchor(e.target.value)}>
        {Object.entries(ANCHOR_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-slate-500 hover:text-slate-700">Cancel</button>
    </form>
  );
};

const emptyLine = { product_id: "", animal_group: "", dose: "", note: "" };

const StepProducts = ({ step, canEdit, products, groups, patchLine, addLine, removeLine }) => {
  const [draft, setDraft] = useState(emptyLine);
  const chosen = products.find((p) => p.id === Number(draft.product_id));
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Products</span>
      {step.products.length === 0 && <p className="text-sm text-slate-400">No products on this step.</p>}
      {step.products.map((line) => (
        <div key={line.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-slate-800">{line.product_name}</span>
          {canEdit ? (
            <>
              <InlineEdit type="number" label="Dose per animal" value={line.dose} placeholder="Dose…"
                format={(v) => `${v} ${line.unit} per animal`} onSave={(v) => patchLine(line.id, { dose: v })} />
              <InlineEdit label="Group" value={line.animal_group} placeholder="All animals" listId="template-groups"
                onSave={(v) => patchLine(line.id, { animal_group: v })} />
              <InlineEdit label="Note" value={line.note} placeholder="Note…" onSave={(v) => patchLine(line.id, { note: v })} />
              <button type="button" aria-label={`Remove ${line.product_name}`} onClick={() => removeLine(line.id)}
                className="ml-auto text-slate-400 hover:text-red-600"><X size={14} /></button>
            </>
          ) : (
            <span className="text-slate-600">
              {line.dose ? `${line.dose} ${line.unit} per animal` : "no dose set"} · {line.animal_group || "all animals"}
              {line.note ? ` · ${line.note}` : ""}
            </span>
          )}
        </div>
      ))}
      {canEdit && (
        <form className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await addLine(step.id, {
              product_id: Number(draft.product_id),
              animal_group: draft.animal_group.trim() || null,
              dose: draft.dose === "" ? null : Number(draft.dose),
              note: draft.note.trim() || null,
            });
            setDraft(emptyLine);
          }}>
          <div className="min-w-[14rem] flex-1">
            <SearchableSelect value={draft.product_id} onChange={(v) => setDraft({ ...draft, product_id: v })}
              options={pickerProducts(products, draft.product_id).map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))}
              placeholder="Add a product…" searchPlaceholder="Search products…" />
          </div>
          <input list="template-groups" aria-label="Group" placeholder="Group (blank = all)" className={`${inputClass} w-36`}
            value={draft.animal_group} onChange={(e) => setDraft({ ...draft, animal_group: e.target.value })} />
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="number" min="0" step="any" aria-label="Dose per animal" placeholder="Dose" className={`${inputClass} w-24`}
              value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} />
            {chosen ? `${chosen.unit} each` : "each"}
          </label>
          <input aria-label="Note" placeholder="Note, e.g. onderhuids" className={`${inputClass} w-40`}
            value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <button type="submit" disabled={!draft.product_id} className={secondary}><Plus size={16} /> Add</button>
        </form>
      )}
      <datalist id="template-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
    </div>
  );
};

const Programs = () => {
  const { user } = useAuth();
  const canEdit = Boolean(user?.is_admin);
  const queryClient = useQueryClient();
  const [previewDate, setPreviewDate] = useState("");
  const [importResult, setImportResult] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: [...TEMPLATE_KEY, previewDate],
    queryFn: async () => (await apiClient.get("/programs/template", { params: previewDate ? { mating_date: previewDate } : {} })).data,
    placeholderData: keepPreviousData, // changing the preview date shouldn't blank the page
  });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: async () => (await apiClient.get("/products/")).data });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: TEMPLATE_KEY });
    queryClient.invalidateQueries({ queryKey: ["program-schedule"] });
    queryClient.invalidateQueries({ queryKey: ["program-calendar"] });
  };
  const call = (fn) => async (...args) => { await fn(...args); refresh(); };
  const patchStep = call((id, changes) => apiClient.patch(`/programs/template/steps/${id}`, changes));
  const patchLine = call((id, changes) => apiClient.patch(`/programs/template/products/${id}`, changes));
  const addLine = call((stepId, line) => apiClient.post(`/programs/template/steps/${stepId}/products`, line));
  const removeLine = call((id) => apiClient.delete(`/programs/template/products/${id}`));

  const addStep = useMutation({
    mutationFn: () => apiClient.post("/programs/template/steps", { anchor: "mating_start", offset_days: 0, stage: "New step" }),
    onSuccess: refresh,
  });
  const removeStep = useMutation({ mutationFn: (id) => apiClient.delete(`/programs/template/steps/${id}`), onSuccess: refresh });
  const importSheet = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file);
      return (await apiClient.post("/programs/template/import", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: (result) => { setImportResult(result); refresh(); },
  });

  if (isLoading || !data) return <div className="p-8 text-center">Loading the herding program…</div>;
  const groups = [...new Set(data.steps.flatMap((s) => s.products.map((p) => p.animal_group)).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-bold text-slate-800">
            <ClipboardList size={28} className="text-emerald-600" /> Herding Program
          </h2>
          <p className="text-slate-500">The master program every client's program follows. Dates are worked out from each client's first mating day.</p>
        </div>
        {canEdit && (
          <label className={`${secondary} cursor-pointer`}>
            <FileSpreadsheet size={18} /> {importSheet.isPending ? "Importing…" : "Import Excel sheet"}
            <input type="file" accept=".xlsx" className="sr-only" disabled={importSheet.isPending}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) importSheet.mutate(file); }} />
          </label>
        )}
      </div>

      {importResult && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Imported "{importResult.name}": {importResult.steps.length} steps ({importResult.created} new, {importResult.updated} updated
          {importResult.removed ? `, ${importResult.removed} removed` : ""}). Steps that kept their timing kept their products and progress.
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-800">Settings</h3>
        <SettingsForm key={JSON.stringify(data.settings)} settings={data.settings} canEdit={canEdit} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-800">Steps ({data.steps.length})</h3>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Show dates for a first mating day of
            <input type="date" className={`${inputClass} py-1`} value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} />
          </label>
        </div>
        {data.steps.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No steps yet. {canEdit ? "Import your Excel sheet, or add steps one by one." : "Ask an admin to set up the program."}
          </p>
        )}
        {data.steps.map((step) => (
          <article key={step.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <StepTiming key={`${step.anchor}${step.offset_days}`} step={step} canEdit={canEdit} onSave={(changes) => patchStep(step.id, changes)} />
                <div className="text-slate-700">
                  {canEdit ? (
                    <InlineEdit label="Stage" value={step.stage} placeholder="Stage…" onSave={(v) => patchStep(step.id, { stage: v })} />
                  ) : step.stage}
                </div>
              </div>
              {canEdit && (
                <button type="button" aria-label="Delete step" title="Delete step"
                  onClick={() => { if (window.confirm("Delete this step from the master program? Clients' ticks for it go too.")) removeStep.mutate(step.id); }}
                  className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
              {TEXT_COLUMNS.map(([key, label]) => (canEdit || step[key]) && (
                <div key={key}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                  {canEdit ? (
                    <InlineEdit multiline label={label} value={step[key]} placeholder="Add…" className="whitespace-pre-line"
                      onSave={(v) => patchStep(step.id, { [key]: v })} />
                  ) : (
                    <p className="whitespace-pre-line text-slate-700">{step[key]}</p>
                  )}
                </div>
              ))}
            </div>
            <StepProducts step={step} canEdit={canEdit} products={products} groups={groups}
              patchLine={patchLine} addLine={addLine} removeLine={removeLine} />
          </article>
        ))}
        {canEdit && (
          <button type="button" onClick={() => addStep.mutate()} disabled={addStep.isPending} className={secondary}>
            <Plus size={16} /> Add a step
          </button>
        )}
      </section>
    </div>
  );
};

export default Programs;
