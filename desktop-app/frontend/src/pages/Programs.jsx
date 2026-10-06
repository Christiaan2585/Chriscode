import React, { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileSpreadsheet, Pencil, Plus, Receipt, Save, Trash2, X } from "lucide-react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import InlineEdit from "../components/InlineEdit";
import ProgramLineForm from "../components/ProgramLineForm";
import { ANCHOR_LABELS, TEXT_COLUMNS, UNDATED, amount, dayLabel, ruleText } from "../utils/herding";

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
        await onSave({ anchor, offset_days: anchor === UNDATED ? 0 : direction * Number(days || 0) });
        setEditing(false);
      }}>
      {anchor !== UNDATED && (
        <>
          <input type="number" min="0" max="800" aria-label="Days" className={`${inputClass} w-20 py-1`} value={days}
            onChange={(e) => setDays(e.target.value)} />
          days
          <select aria-label="Before or after" className={`${inputClass} py-1`} value={direction} onChange={(e) => setDirection(Number(e.target.value))}>
            <option value={-1}>before</option>
            <option value={1}>after</option>
          </select>
        </>
      )}
      <select aria-label="From" className={`${inputClass} py-1`} value={anchor} onChange={(e) => setAnchor(e.target.value)}>
        {Object.entries(ANCHOR_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        <option value={UNDATED}>no date (medicine box)</option>
      </select>
      <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-slate-500 hover:text-slate-700">Cancel</button>
    </form>
  );
};

// One product line: "Ooie, Ramme - 2 ml per animal" or "2 packs (medicine box)".
const lineText = (line) =>
  line.fixed_quantity
    ? `${amount(line.fixed_quantity)} pack${line.fixed_quantity === 1 ? "" : "s"} (medicine box)`
    : `${line.dose ? `${amount(line.dose)} ${line.unit || ""} per animal` : "no dose set"} · ${line.animal_group || "all animals"}`;

const StepProducts = ({ step, canEdit, products, patchLine, addLine, removeLine }) => {
  const [form, setForm] = useState(null); // "new" or a line id
  const save = async (payload) => {
    const ok = form === "new" ? await addLine(step.id, payload) : await patchLine(form, payload);
    if (ok) setForm(null);
  };
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Products</span>
      {step.products.length === 0 && <p className="text-sm text-slate-400">No products on this step.</p>}
      {step.products.map((line) => (form === line.id ? (
        <ProgramLineForm key={line.id} line={line} products={products} onSubmit={save} onCancel={() => setForm(null)} />
      ) : (
        <div key={line.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          {line.category && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{line.category}</span>}
          <span className="font-medium text-slate-800">{line.product_name}</span>
          <span className="text-slate-600">{lineText(line)}{line.note ? ` · ${line.note}` : ""}</span>
          {canEdit && (
            <span className="ml-auto flex">
              <button type="button" aria-label={`Change ${line.product_name}`} title="Change" onClick={() => setForm(line.id)}
                className="p-1 text-slate-400 hover:text-emerald-700"><Pencil size={14} /></button>
              <button type="button" aria-label={`Remove ${line.product_name}`} title="Remove" onClick={() => removeLine(line.id)}
                className="p-1 text-slate-400 hover:text-red-600"><X size={14} /></button>
            </span>
          )}
        </div>
      )))}
      {canEdit && (form === "new" ? (
        <ProgramLineForm products={products} submitLabel="Add" onSubmit={save} onCancel={() => setForm(null)} />
      ) : (
        <button type="button" onClick={() => setForm("new")} className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
          <Plus size={13} /> Add a product
        </button>
      ))}
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
  // Failures already show as a toast (api/client.js); true when it worked.
  const call = (fn) => async (...args) => {
    try {
      await fn(...args);
      return true;
    } catch {
      return false;
    } finally {
      refresh();
    }
  };
  const patchStep = call((id, changes) => apiClient.patch(`/programs/template/steps/${id}`, changes));
  const patchLine = call((id, changes) => apiClient.patch(`/programs/template/products/${id}`, changes));
  const addLine = call((stepId, line) => apiClient.post(`/programs/template/steps/${stepId}/products`, line));
  const removeLine = call((id) => apiClient.delete(`/programs/template/products/${id}`));

  const addStep = useMutation({
    mutationFn: () => apiClient.post("/programs/template/steps", { anchor: "mating_start", offset_days: 0, stage: "New step" }),
    onSuccess: refresh,
  });
  const removeStep = useMutation({ mutationFn: (id) => apiClient.delete(`/programs/template/steps/${id}`), onSuccess: refresh });
  const upload = (path, kind) => async (file) => {
    const form = new FormData();
    form.append("file", file);
    return { kind, ...(await apiClient.post(path, form, { headers: { "Content-Type": "multipart/form-data" } })).data };
  };
  const importSheet = useMutation({
    mutationFn: upload("/programs/template/import", "program"),
    onSuccess: (result) => { setImportResult(result); refresh(); },
  });
  const importCosts = useMutation({
    mutationFn: upload("/programs/template/import-costs", "costs"),
    onSuccess: (result) => { setImportResult(result); refresh(); },
  });

  if (isLoading || !data) return <div className="p-8 text-center">Loading the herding program…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-bold text-slate-800">
            <ClipboardList size={28} className="text-emerald-600" /> Herding Program
          </h2>
          <p className="text-slate-500">
            The master program every new client program is copied from. Dates are worked out from each client's first mating day;
            each client's copy can then be changed on its own.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {[[importSheet, "Import program sheet", FileSpreadsheet], [importCosts, "Import cost sheet", Receipt]].map(([mutation, label, Icon]) => (
              <label key={label} className={`${secondary} cursor-pointer`}>
                <Icon size={18} /> {mutation.isPending ? "Importing…" : label}
                <input type="file" accept=".xlsx" className="sr-only" disabled={mutation.isPending}
                  onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) mutation.mutate(file); }} />
              </label>
            ))}
          </div>
        )}
      </div>

      {importResult?.kind === "program" && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Imported "{importResult.name}": {importResult.steps.length} steps ({importResult.created} new, {importResult.updated} updated
          {importResult.removed ? `, ${importResult.removed} removed` : ""}). Steps that kept their timing kept their products.
        </p>
      )}
      {importResult?.kind === "costs" && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p>
            Imported the cost sheet: {importResult.lines} product lines ({importResult.steps_created} new steps; the rest joined
            the program's steps on the same day). Clients' programs made before this keep their own copy - use "Start again
            from the master program" on a client's program to bring these in.
          </p>
          {importResult.unmatched.length > 0 && (
            <p className="mt-1 text-amber-700">
              Not in the product list, so left out: {importResult.unmatched.join(", ")}. Add them under Products (same name) and import again.
            </p>
          )}
        </div>
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
                  onClick={() => { if (window.confirm("Delete this step from the master program? Clients' own programs keep their copy.")) removeStep.mutate(step.id); }}
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
            <StepProducts step={step} canEdit={canEdit} products={products}
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
