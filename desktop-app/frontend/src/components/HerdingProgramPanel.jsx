import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, CheckCircle2, ClipboardList, FileDown, FileText, Pencil, Plus, Receipt, RotateCcw, Trash2, X,
} from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import DocumentPreview from "./DocumentPreview";
import InlineEdit from "./InlineEdit";
import ProgramLineForm from "./ProgramLineForm";
import { money } from "../utils/format";
import { GROUPS, STEP_STATUS, TEXT_COLUMNS, amount, dayLabel, isMonday, ruleText, toInputDate } from "../utils/herding";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const buttonClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const primary = `${buttonClass} bg-emerald-600 text-white shadow-sm hover:bg-emerald-700`;
const secondary = `${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-600`;
const linkButton = "text-xs font-medium text-emerald-700 hover:underline";

const useTemplate = () =>
  useQuery({ queryKey: ["program-template"], queryFn: async () => (await apiClient.get("/programs/template")).data });

const useSchedule = (programId) =>
  useQuery({
    queryKey: ["program-schedule", programId],
    queryFn: async () => (await apiClient.get(`/programs/${programId}/schedule`)).data,
  });

const useProducts = () =>
  useQuery({ queryKey: ["products"], queryFn: async () => (await apiClient.get("/products/")).data });

const ruleLabel = (step) => ruleText(step.anchor, step.offset_days);
// The next step to do: the medicine box ("none") has no date, so it's never "next".
const nextStep = (steps) => steps?.find((s) => s.status !== "done" && s.status !== "none");
const fileName = (text) => text.replace(/[\\/:*?"<>|]+/g, "");

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);

// The five headcounts (plus any other group a program already has).
const HeadCountFields = ({ counts, onChange }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {Object.keys(counts).map((name) => (
      <label key={name} className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">{name}</span>
        <input type="number" min="0" inputMode="numeric" className={inputClass} value={counts[name]} placeholder="0"
          onChange={(e) => onChange({ ...counts, [name]: e.target.value })} />
      </label>
    ))}
  </div>
);

const countsFrom = (groups = []) => {
  const counts = Object.fromEntries(GROUPS.map((name) => [name, ""]));
  for (const g of groups) {
    const known = GROUPS.find((name) => name.toLowerCase() === g.animal_type.trim().toLowerCase());
    counts[known || g.animal_type] = String(g.group_size);
  }
  return counts;
};
const countsPayload = (counts) =>
  ({ counts: Object.fromEntries(Object.entries(counts).map(([name, n]) => [name, Number(n) || 0])) });

// New program or editing one's dates. Blank numbers fall back to the master
// program's defaults (shown as placeholders).
const ProgramForm = ({ initial, settings, withCounts, submitting, onSubmit, onCancel }) => {
  const [form, setForm] = useState(initial);
  const [counts, setCounts] = useState(() => countsFrom());
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const rule = form.weaning_rule || settings?.weaning_rule || "fixed";

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form, counts); }}>
      <Field label="Program name">
        <input required className={inputClass} value={form.name} onChange={set("name")} placeholder="e.g. Kudde 2026" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="First mating day (dektyd)"
          hint={form.mating_date && !isMonday(form.mating_date) ? "Not a Monday - the program's dates are meant to start on a Monday." : "Always pick a Monday."}
        >
          <input required type="date" className={inputClass} value={form.mating_date} onChange={set("mating_date")} />
        </Field>
        <Field label="Mating season (weeks)">
          <input type="number" min="1" max="52" className={inputClass} value={form.mating_weeks}
            onChange={set("mating_weeks")} placeholder={String(settings?.mating_weeks ?? "")} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Weaning day</legend>
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <input type="radio" name="weaning_rule" aria-label="Wean by age" checked={rule === "age"} className="accent-emerald-600"
            onChange={() => setForm({ ...form, weaning_rule: "age" })} />
          Lambs weaned at
          <input type="number" min="1" max="12" aria-label="Weaning age in months" className="w-20 rounded-lg border border-slate-200 px-2 py-1"
            value={form.weaning_months} onChange={set("weaning_months")} placeholder={String(settings?.weaning_months ?? "")} />
          months (after lambing starts)
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <input type="radio" name="weaning_rule" aria-label="Wean a set number of days after the first mating day" checked={rule === "fixed"} className="accent-emerald-600"
            onChange={() => setForm({ ...form, weaning_rule: "fixed" })} />
          <input type="number" min="30" max="720" aria-label="Days from the first mating day to weaning" className="w-20 rounded-lg border border-slate-200 px-2 py-1"
            value={form.weaning_days} onChange={set("weaning_days")} placeholder={String(settings?.weaning_days ?? "")} />
          days after the first mating day (as the Excel sheet works it out)
        </label>
      </fieldset>
      <Field label="Notes (optional)">
        <input className={inputClass} value={form.goal} onChange={set("goal")} />
      </Field>

      {withCounts && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <span className="block text-sm font-medium text-slate-700">Animals</span>
          <HeadCountFields counts={counts} onChange={setCounts} />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
        <button type="submit" disabled={submitting} className={primary}>{submitting ? "Saving…" : "Save program"}</button>
      </div>
    </form>
  );
};

const programPayload = (form) => {
  const number = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  return {
    name: form.name.trim(),
    goal: form.goal?.trim() || null,
    mating_date: form.mating_date || null,
    mating_weeks: number(form.mating_weeks),
    weaning_rule: form.weaning_rule || null,
    weaning_months: number(form.weaning_months),
    weaning_days: number(form.weaning_days),
  };
};

const formFrom = (p) => ({
  name: p?.name || "",
  goal: p?.goal || "",
  mating_date: toInputDate(p?.mating_date),
  mating_weeks: p?.mating_weeks ?? "",
  weaning_rule: p?.weaning_rule || "",
  weaning_months: p?.weaning_months ?? "",
  weaning_days: p?.weaning_days ?? "",
});

const StatusChip = ({ status }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STEP_STATUS[status].className}`}>
    {STEP_STATUS[status].label}
  </span>
);

// The step's date: worked out from the program, or typed in for this client.
const StepDate = ({ step, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toInputDate(step.date));
  if (step.status === "none") return <span className="font-semibold text-slate-800">Any time</span>;
  if (editing) {
    return (
      <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (await onSave({ date_override: value || null })) setEditing(false);
      }}>
        <input type="date" required aria-label="Date for this step" value={value} onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm" />
        <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700">Save</button>
        <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
      </form>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-800">
        {dayLabel(step.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      </span>
      <button type="button" className={linkButton} onClick={() => { setValue(toInputDate(step.date)); setEditing(true); }}>
        Change date
      </button>
      {step.date_override && (
        <button type="button" className="text-xs text-slate-500 hover:underline" title={ruleLabel(step)}
          onClick={() => onSave({ date_override: null })}>
          Back to the program's date
        </button>
      )}
    </span>
  );
};

const LineRow = ({ line, selected, onToggle, onEdit, onDelete }) => (
  <tr className="align-top">
    <td className="py-1.5 pr-2">
      <input type="checkbox" aria-label={`Add ${line.product_name} to a quote`} className="mt-0.5 h-4 w-4 accent-emerald-600"
        disabled={!line.buy} checked={selected} onChange={(e) => onToggle(e.target.checked)} />
    </td>
    <td className="py-1.5 pr-3">
      {line.category && <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{line.category}</span>}
      <span className="font-medium text-slate-800">{line.product_name}</span>
      {line.note && <span className="block text-xs text-slate-500">{line.note}</span>}
    </td>
    <td className="py-1.5 pr-3 text-slate-600">
      {line.fixed_quantity ? "Medicine box" : `${line.animal_group || "All animals"} (${amount(line.head)})`}
    </td>
    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
      {line.fixed_quantity ? "—" : line.dose ? `${amount(line.dose)} ${line.unit || ""}` : "No dose"}
    </td>
    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600"
      title={line.pack_size ? `${amount(line.pack_size)} ${line.unit || ""} per pack` : undefined}>
      {line.used.toFixed(2)}{line.buy !== line.used && <span className="text-slate-400"> ({amount(line.buy)})</span>}
    </td>
    <td className="py-1.5 pr-2 text-right font-medium tabular-nums text-slate-800">{money(line.cost_used)}</td>
    <td className="whitespace-nowrap py-1.5 text-right">
      <button type="button" onClick={onEdit} aria-label={`Change ${line.product_name}`} title="Change"
        className="p-1 text-slate-400 hover:text-emerald-700"><Pencil size={14} /></button>
      <button type="button" onClick={onDelete} aria-label={`Remove ${line.product_name}`} title="Remove"
        className="p-1 text-slate-400 hover:text-red-600"><X size={14} /></button>
    </td>
  </tr>
);

// The client's own program: every step with its date, done tick, products
// and costs (like the cost sheet). Changes here are this client's only.
const ProgramDetail = ({ programId, clientId, clientName, onClose }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useSchedule(programId);
  const { data: template } = useTemplate();
  const { data: products = [] } = useProducts();
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(false);
  const [counts, setCounts] = useState(null); // headcounts being changed, or null
  const [lineForm, setLineForm] = useState(null); // {stepId} to add, {lineId} to change
  const [newStep, setNewStep] = useState(null);
  const [quoteResult, setQuoteResult] = useState(null);
  const [preview, setPreview] = useState(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["program-schedule", programId] });
    queryClient.invalidateQueries({ queryKey: ["programs", "client", String(clientId)] });
    queryClient.invalidateQueries({ queryKey: ["program-calendar"] });
  };
  // Failures already show as a toast (api/client.js); true when it worked.
  const run = async (request) => {
    try {
      await request;
      return true;
    } catch {
      return false;
    } finally {
      refresh();
    }
  };
  const base = `/programs/${programId}`;
  const patchStep = (stepId, changes) => run(apiClient.patch(`${base}/steps/${stepId}`, changes));

  const toggleDone = useMutation({
    mutationFn: ({ stepId, done }) => apiClient.put(`${base}/steps/${stepId}/done`, { done }),
    onSettled: refresh,
  });
  const saveDetails = useMutation({
    mutationFn: (form) => apiClient.patch(base, programPayload(form)),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const saveCounts = useMutation({
    mutationFn: () => apiClient.put(`${base}/counts`, countsPayload(counts)),
    onSuccess: () => { setCounts(null); refresh(); },
  });
  const reset = useMutation({
    mutationFn: () => apiClient.post(`${base}/reset`),
    onSuccess: () => { setSelected(new Set()); refresh(); },
  });
  const makeQuote = useMutation({
    mutationFn: async () => (await apiClient.post(`${base}/quote`, { line_ids: [...selected] })).data,
    onSuccess: (result) => {
      setQuoteResult(result);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quotes", "client", String(clientId)] });
    },
  });

  const toggle = (ids, on) => {
    const next = new Set(selected);
    ids.forEach((lineId) => (on ? next.add(lineId) : next.delete(lineId)));
    setSelected(next);
  };
  const saveLine = async (payload) => {
    const request = lineForm.lineId
      ? apiClient.patch(`${base}/lines/${lineForm.lineId}`, payload)
      : apiClient.post(`${base}/steps/${lineForm.stepId}/products`, payload);
    if (await run(request)) setLineForm(null);
  };
  const removeLine = (line) => {
    if (!window.confirm(`Remove ${line.product_name} from this client's program?`)) return;
    toggle([line.id], false);
    run(apiClient.delete(`${base}/lines/${line.id}`));
  };
  const removeStep = (step) => {
    if (!window.confirm(`Remove "${step.stage || ruleLabel(step)}" and its products from this client's program?`)) return;
    toggle(step.products.map((l) => l.id), false);
    run(apiClient.delete(`${base}/steps/${step.id}`));
  };
  const addStep = async (e) => {
    e.preventDefault();
    const ok = await run(apiClient.post(`${base}/steps`, {
      anchor: "mating_start", offset_days: 0, stage: newStep.stage.trim() || null, date_override: newStep.date,
    }));
    if (ok) setNewStep(null);
  };

  if (isLoading || !data) return <Modal isOpen onClose={onClose} title="Herding program" size="xl"><p className="text-sm text-slate-500">Loading…</p></Modal>;
  const { program, groups, steps, anchors, progress, totals } = data;
  const current = nextStep(steps);
  const allLineIds = steps.flatMap((s) => s.products.filter((l) => l.buy > 0).map((l) => l.id));
  const title = `${clientName} - ${program.name}`;

  return (
    <>
      <Modal isOpen onClose={onClose} title={`${program.name} - ${clientName}`} size="xl">
        {editing ? (
          <ProgramForm initial={formFrom(program)} settings={data.template}
            submitting={saveDetails.isPending} onSubmit={(form) => saveDetails.mutate(form)} onCancel={() => setEditing(false)} />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              {anchors ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  {[["First mating", anchors.mating_start], ["Mating ends", anchors.mating_end],
                    ["Lambing starts", anchors.lambing_start], ["Weaning", anchors.weaning]].map(([label, day]) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="font-semibold text-slate-800">{dayLabel(day)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-amber-700">Set the first mating day to work out this program's dates and costs.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(true)} className={secondary}><CalendarDays size={16} /> Edit dates</button>
                {anchors && (
                  <>
                    <button type="button" className={secondary} onClick={() => setPreview({
                      kind: "program", id: programId, title: program.name, url: `${base}/pdf`,
                      filename: fileName(`Herding program - ${title}.pdf`),
                      hint: "Download it and send it to the farmer on WhatsApp or email.",
                    })}><FileDown size={16} /> Program PDF</button>
                    <button type="button" className={secondary} onClick={() => setPreview({
                      kind: "program-costs", id: programId, title: `${program.name} - costs`, url: `${base}/costs.pdf`,
                      filename: fileName(`Program costs - ${title}.pdf`),
                      hint: "The costs laid out like the cost sheet, amounts excluding VAT.",
                    })}><Receipt size={16} /> Costs PDF</button>
                  </>
                )}
              </div>
            </div>

            {anchors && (
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-4">
                {[["Total cost (what's used)", money(totals.cost_used)],
                  ["Buying whole packs", money(totals.cost_buy)],
                  ["Animals", amount(totals.animals)],
                  ["Cost per animal per year", money(totals.per_animal)]].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-emerald-800">{label}</dt>
                    <dd className="text-lg font-bold tabular-nums text-slate-900">{value}</dd>
                  </div>
                ))}
                <p className="col-span-full text-xs text-emerald-800">Prices exclude VAT.</p>
              </dl>
            )}

            {progress.total > 0 && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{progress.done} of {progress.total} steps done</span>
                  {current && <span>Next: {current.stage || ruleLabel(current)} - {dayLabel(current.date)}</span>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0}
                  aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Program progress">
                  <div className="h-full bg-emerald-500" style={{ width: `${(100 * progress.done) / progress.total}%` }} />
                </div>
              </div>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Animals</h4>
                {!counts && <button type="button" className={linkButton} onClick={() => setCounts(countsFrom(groups))}>Change numbers</button>}
              </div>
              {counts ? (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveCounts.mutate(); }}>
                  <HeadCountFields counts={counts} onChange={setCounts} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setCounts(null)} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                    <button type="submit" disabled={saveCounts.isPending} className={primary}>{saveCounts.isPending ? "Saving…" : "Save numbers"}</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groups.length === 0 && <p className="text-sm text-amber-700">No animals counted yet - the costs need the numbers.</p>}
                  {groups.map((g) => (
                    <span key={g.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                      {g.animal_type} <b className="tabular-nums">{amount(g.group_size)}</b>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {quoteResult && (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <p className="flex items-center gap-2">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Draft quote <b>{quoteResult.quote.number}</b> made. <Link to="/quotes" className="font-semibold underline">Open Quotes</Link>
                </p>
                {quoteResult.skipped.length > 0 && (
                  <ul className="mt-1 list-disc pl-6 text-amber-700">{quoteResult.skipped.map((s) => <li key={s}>{s}</li>)}</ul>
                )}
              </div>
            )}

            {anchors && steps.length === 0 && (
              <p className="text-sm text-slate-500">
                The master program has no steps yet - set it up under <Link to="/programs" className="underline">Herding Program</Link>,
                then use "Start again from the master program" below.
              </p>
            )}
            <ol className="space-y-3">
              {steps.map((step) => {
                const lineIds = step.products.filter((l) => l.buy > 0).map((l) => l.id);
                const allOn = lineIds.length > 0 && lineIds.every((lineId) => selected.has(lineId));
                return (
                  <li key={step.id} className={`rounded-xl border p-4 ${step === current ? "border-emerald-400 ring-1 ring-emerald-400" : "border-slate-200"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <StepDate key={`${step.date}`} step={step} onSave={(changes) => patchStep(step.id, changes)} />
                          {step.status !== "none" && <StatusChip status={step.status} />}
                        </div>
                        <div className="text-sm text-slate-600">
                          <InlineEdit label="Step name" value={step.stage} placeholder={ruleLabel(step)}
                            onSave={(v) => patchStep(step.id, { stage: v })} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {step.status !== "none" && (
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={step.status === "done"}
                              disabled={toggleDone.isPending}
                              onChange={(e) => toggleDone.mutate({ stepId: step.id, done: e.target.checked })} />
                            Done
                          </label>
                        )}
                        <button type="button" onClick={() => removeStep(step)} aria-label="Remove this step" title="Remove this step"
                          className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                      </div>
                    </div>
                    {TEXT_COLUMNS.some(([key]) => step[key]) && (
                      <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        {TEXT_COLUMNS.filter(([key]) => step[key]).map(([key, label]) => (
                          <div key={key}>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                            <p className="whitespace-pre-line text-slate-700">{step[key]}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      {step.products.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[40rem] text-sm">
                            <thead>
                              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                                <th className="pb-1 pr-2 font-semibold">
                                  {lineIds.length > 0 && (
                                    <input type="checkbox" aria-label="Tick every product of this step" className="h-4 w-4 accent-emerald-600"
                                      checked={allOn} onChange={() => toggle(lineIds, !allOn)} />
                                  )}
                                </th>
                                <th className="pb-1 pr-3 font-semibold">Product</th>
                                <th className="pb-1 pr-3 font-semibold">For</th>
                                <th className="pb-1 pr-3 text-right font-semibold">Dose / animal</th>
                                <th className="pb-1 pr-3 text-right font-semibold" title="Packs actually used, whole packs to buy in brackets">Packs</th>
                                <th className="pb-1 pr-2 text-right font-semibold">Cost excl VAT</th>
                                <th className="pb-1"><span className="sr-only">Actions</span></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {step.products.map((line) => (lineForm?.lineId === line.id ? (
                                <tr key={line.id}><td colSpan={7} className="py-2">
                                  <ProgramLineForm line={line} products={products} onSubmit={saveLine} onCancel={() => setLineForm(null)} />
                                </td></tr>
                              ) : (
                                <LineRow key={line.id} line={line} selected={selected.has(line.id)}
                                  onToggle={(on) => toggle([line.id], on)} onEdit={() => setLineForm({ lineId: line.id })}
                                  onDelete={() => removeLine(line)} />
                              )))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-slate-300">
                                <td colSpan={5} className="pt-1.5 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Subtotal</td>
                                <td className="pt-1.5 pr-2 text-right font-bold tabular-nums text-slate-900">{money(step.subtotal)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      {lineForm?.stepId === step.id ? (
                        <div className="mt-2">
                          <ProgramLineForm products={products} submitLabel="Add" onSubmit={saveLine} onCancel={() => setLineForm(null)} />
                        </div>
                      ) : (
                        <button type="button" onClick={() => setLineForm({ stepId: step.id })} className={`${linkButton} mt-2 flex items-center gap-1`}>
                          <Plus size={13} /> Add a product
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {anchors && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {newStep ? (
                  <form onSubmit={addStep} className="flex flex-wrap items-center gap-2">
                    <input required type="date" aria-label="Date of the new step" value={newStep.date}
                      onChange={(e) => setNewStep({ ...newStep, date: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                    <input aria-label="Name of the new step" placeholder="What happens, e.g. Bloutong enting" value={newStep.stage}
                      onChange={(e) => setNewStep({ ...newStep, stage: e.target.value })} className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                    <button type="submit" className={primary}>Add step</button>
                    <button type="button" onClick={() => setNewStep(null)} className="px-2 py-1 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                  </form>
                ) : (
                  <button type="button" onClick={() => setNewStep({ date: "", stage: "" })} className={secondary}><Plus size={16} /> Add a step</button>
                )}
                <button type="button" disabled={reset.isPending} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-700"
                  onClick={() => {
                    if (window.confirm("Start this client's program again from the master program? Changed products, doses and dates go back to the master's; steps already ticked off stay ticked.")) reset.mutate();
                  }}>
                  <RotateCcw size={14} /> Start again from the master program
                </button>
              </div>
            )}

            <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-3">
              {allLineIds.length > 0 && (
                <button type="button" className={linkButton}
                  onClick={() => setSelected(selected.size === allLineIds.length ? new Set() : new Set(allLineIds))}>
                  {selected.size === allLineIds.length ? "Untick everything" : "Tick everything"}
                </button>
              )}
              <span className="text-sm text-slate-600">{selected.size} product{selected.size === 1 ? "" : "s"} ticked</span>
              <button type="button" disabled={!selected.size || makeQuote.isPending} onClick={() => makeQuote.mutate()} className={primary}>
                <FileText size={16} /> {makeQuote.isPending ? "Making quote…" : "Make a quote"}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  );
};

const ProgramCard = ({ program, onOpen, onDelete }) => {
  const { data } = useSchedule(program.id);
  const next = nextStep(data?.steps);
  const progress = data?.progress;
  const perAnimal = data?.totals?.cost_used > 0 ? data.totals.per_animal : null;
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <span className="block font-medium text-slate-700 hover:text-emerald-700">{program.name}</span>
          {program.mating_date ? (
            <span className="mt-0.5 block text-xs text-slate-500">First mating {dayLabel(program.mating_date)}</span>
          ) : (
            <span className="mt-0.5 block text-xs text-amber-700">No mating date yet</span>
          )}
          {next && (
            <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-600">
              <StatusChip status={next.status} /> {next.stage || ruleLabel(next)} - {dayLabel(next.date)}
            </span>
          )}
          {progress?.total > 0 && (
            <span className="mt-1 block text-xs text-slate-500">
              {progress.done} of {progress.total} steps done
              {perAnimal !== null && <> · {money(data.totals.cost_used)} ({money(perAnimal)} per animal)</>}
            </span>
          )}
        </button>
        <button type="button" onClick={onDelete} title="Delete program" aria-label={`Delete ${program.name}`}
          className="p-1.5 text-slate-400 transition-colors hover:text-red-600">
          <Trash2 size={16} />
        </button>
      </div>
      {(program.groups || []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {program.groups.map((g) => (
            <span key={g.id} className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-xs font-medium text-emerald-700">
              {g.animal_type} × {g.group_size}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// The client page's "Herding Programs" card.
const HerdingProgramPanel = ({ clientId, clientName }) => {
  const queryClient = useQueryClient();
  const key = ["programs", "client", String(clientId)];
  const { data: programs } = useQuery({
    queryKey: key,
    queryFn: async () => (await apiClient.get(`/programs/client/${clientId}`)).data,
  });
  const { data: template } = useTemplate();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const create = useMutation({
    mutationFn: async ({ form, counts }) => {
      const created = (await apiClient.post("/programs/", { ...programPayload(form), client_id: Number(clientId) })).data;
      await apiClient.put(`/programs/${created.id}/counts`, countsPayload(counts));
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["program-calendar"] });
      setCreating(false);
      setOpenId(created.id);
    },
  });
  const remove = useMutation({
    mutationFn: (programId) => apiClient.delete(`/programs/${programId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["program-calendar"] });
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList size={18} className="text-emerald-600" /> Herding Programs
        </h3>
        <button type="button" onClick={() => setCreating(true)}
          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white transition-colors hover:bg-emerald-700">
          + New Program
        </button>
      </div>
      {!programs?.length ? (
        <p className="text-sm text-slate-400">No herding programs for this client yet.</p>
      ) : (
        <div className="space-y-3">
          {programs.map((p) => (
            <ProgramCard key={p.id} program={p} onOpen={() => setOpenId(p.id)}
              onDelete={() => { if (window.confirm(`Delete program "${p.name}"? This can't be undone.`)) remove.mutate(p.id); }} />
          ))}
        </div>
      )}

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="New herding program" size="lg">
        {creating && (
          <ProgramForm initial={formFrom(null)} settings={template?.settings} withCounts
            submitting={create.isPending} onSubmit={(form, counts) => create.mutate({ form, counts })}
            onCancel={() => setCreating(false)} />
        )}
      </Modal>
      {openId && <ProgramDetail programId={openId} clientId={clientId} clientName={clientName} onClose={() => setOpenId(null)} />}
    </div>
  );
};

export default HerdingProgramPanel;
