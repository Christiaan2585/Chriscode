import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, FileDown, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import DocumentPreview from "./DocumentPreview";
import { STEP_STATUS, TEXT_COLUMNS, dayLabel, isMonday, productAmount, ruleText, toInputDate } from "../utils/herding";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const buttonClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const primary = `${buttonClass} bg-emerald-600 text-white shadow-sm hover:bg-emerald-700`;
const secondary = `${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-600`;

const useTemplate = () =>
  useQuery({ queryKey: ["program-template"], queryFn: async () => (await apiClient.get("/programs/template")).data });

const useSchedule = (programId) =>
  useQuery({
    queryKey: ["program-schedule", programId],
    queryFn: async () => (await apiClient.get(`/programs/${programId}/schedule`)).data,
  });

// Group names the master program's products are dosed by (e.g. "Ooie",
// "Ramme") - a program's headcounts need the same names to be counted.
const groupNames = (template) =>
  [...new Set((template?.steps || []).flatMap((s) => s.products.map((p) => p.animal_group)).filter(Boolean))];

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);

// New program or editing one's dates. Blank numbers fall back to the master
// program's defaults (shown as placeholders).
const ProgramForm = ({ initial, settings, suggestions, withGroups, submitting, onSubmit, onCancel }) => {
  const [form, setForm] = useState(initial);
  const [groups, setGroups] = useState([]);
  const [draft, setDraft] = useState({ animal_type: "", group_size: "" });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const rule = form.weaning_rule || settings?.weaning_rule || "fixed";
  const addGroup = () => {
    if (!draft.animal_type.trim() || !(Number(draft.group_size) > 0)) return;
    setGroups([...groups, { animal_type: draft.animal_type.trim(), group_size: Number(draft.group_size) }]);
    setDraft({ animal_type: "", group_size: "" });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form, groups);
      }}
    >
      <Field label="Program name">
        <input required className={inputClass} value={form.name} onChange={set("name")} placeholder="e.g. Ooie 2026" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="First mating day"
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

      {withGroups && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <span className="block text-sm font-medium text-slate-700">Animals</span>
          <p className="text-xs text-slate-500">
            Use the same group names as the master program's products{suggestions.length ? ` (${suggestions.join(", ")})` : ""},
            so the amounts can be worked out.
          </p>
          {groups.map((g, i) => (
            <div key={`${g.animal_type}-${i}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span>{g.animal_type} - {g.group_size}</span>
              <button type="button" aria-label={`Remove ${g.animal_type}`} onClick={() => setGroups(groups.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-600"><X size={14} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input list="program-groups" aria-label="Group name" placeholder="Group, e.g. Ooie" className={inputClass}
              value={draft.animal_type} onChange={(e) => setDraft({ ...draft, animal_type: e.target.value })} />
            <input type="number" min="1" aria-label="How many" placeholder="How many" className={`${inputClass} w-32`}
              value={draft.group_size} onChange={(e) => setDraft({ ...draft, group_size: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }} />
            <button type="button" onClick={addGroup} className={secondary}><Plus size={16} /> Add</button>
          </div>
          <datalist id="program-groups">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
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

// The client's program: every step with its date, done tick, what to do and
// the products - ticked product lines become a quote.
const ProgramDetail = ({ programId, clientId, clientName, onClose }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useSchedule(programId);
  const { data: template } = useTemplate();
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(false);
  const [newGroup, setNewGroup] = useState({ animal_type: "", group_size: "" });
  const [quoteResult, setQuoteResult] = useState(null);
  const [preview, setPreview] = useState(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["program-schedule", programId] });
    queryClient.invalidateQueries({ queryKey: ["programs", "client", String(clientId)] });
    queryClient.invalidateQueries({ queryKey: ["program-calendar"] });
  };
  const toggleDone = useMutation({
    mutationFn: ({ stepId, done }) => apiClient.put(`/programs/${programId}/steps/${stepId}/done`, { done }),
    onSuccess: refresh,
  });
  const saveDetails = useMutation({
    mutationFn: (form) => apiClient.patch(`/programs/${programId}`, programPayload(form)),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const addGroup = useMutation({
    mutationFn: () => apiClient.post(`/programs/${programId}/groups`, {
      program_id: programId, animal_type: newGroup.animal_type.trim(), group_size: Number(newGroup.group_size),
    }),
    onSuccess: () => { setNewGroup({ animal_type: "", group_size: "" }); refresh(); },
  });
  const removeGroup = useMutation({ mutationFn: (groupId) => apiClient.delete(`/programs/groups/${groupId}`), onSuccess: refresh });
  const makeQuote = useMutation({
    mutationFn: async () => (await apiClient.post(`/programs/${programId}/quote`, { line_ids: [...selected] })).data,
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

  if (isLoading || !data) return <Modal isOpen onClose={onClose} title="Herding program" size="xl"><p className="text-sm text-slate-500">Loading…</p></Modal>;
  const { program, groups, steps, anchors, progress } = data;
  const current = steps.find((s) => s.status !== "done");
  const canAddGroup = newGroup.animal_type.trim() && Number(newGroup.group_size) > 0;

  return (
    <>
      <Modal isOpen onClose={onClose} title={`${program.name} - ${clientName}`} size="xl">
        {editing ? (
          <ProgramForm initial={formFrom(program)} settings={data.template} suggestions={groupNames(template)}
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
                <p className="text-sm text-amber-700">Set the first mating day to work out this program's dates.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(true)} className={secondary}><Pencil size={16} /> Edit dates</button>
                {anchors && (
                  <button type="button" className={secondary} onClick={() => setPreview({
                    kind: "program", id: programId, title: program.name, url: `/programs/${programId}/pdf`,
                    filename: `Herding program - ${clientName} - ${program.name}.pdf`.replace(/[\\/:*?"<>|]+/g, ""),
                    hint: "Download it and send it to the farmer on WhatsApp or email.",
                  })}><FileDown size={16} /> PDF for the farmer</button>
                )}
              </div>
            </div>

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
              <h4 className="text-sm font-semibold text-slate-800">Animals</h4>
              <div className="flex flex-wrap items-center gap-2">
                {groups.map((g) => (
                  <span key={g.id} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                    {g.animal_type} × {g.group_size}
                    <button type="button" aria-label={`Remove ${g.animal_type}`} onClick={() => removeGroup.mutate(g.id)}
                      className="text-emerald-600 hover:text-red-600"><X size={14} /></button>
                  </span>
                ))}
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (canAddGroup) addGroup.mutate(); }}>
                  <input list="program-groups-detail" aria-label="Group name" placeholder="Group" className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    value={newGroup.animal_type} onChange={(e) => setNewGroup({ ...newGroup, animal_type: e.target.value })} />
                  <input type="number" min="1" aria-label="How many" placeholder="How many" className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    value={newGroup.group_size} onChange={(e) => setNewGroup({ ...newGroup, group_size: e.target.value })} />
                  <button type="submit" disabled={!canAddGroup || addGroup.isPending} className={secondary}><Plus size={14} /> Add</button>
                </form>
                <datalist id="program-groups-detail">{groupNames(template).map((s) => <option key={s} value={s} />)}</datalist>
              </div>
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

            {steps.length === 0 ? (
              <p className="text-sm text-slate-500">
                {anchors ? <>The master program has no steps yet - set it up under <Link to="/programs" className="underline">Herding Program</Link>.</> : null}
              </p>
            ) : (
              <ol className="space-y-3">
                {steps.map((step) => {
                  const lineIds = step.products.filter((l) => l.units > 0).map((l) => l.id);
                  const allOn = lineIds.length > 0 && lineIds.every((lineId) => selected.has(lineId));
                  return (
                    <li key={step.id} className={`rounded-xl border p-4 ${step === current ? "border-emerald-400 ring-1 ring-emerald-400" : "border-slate-200"} ${step.status === "done" ? "opacity-70" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-800">{dayLabel(step.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                            <StatusChip status={step.status} />
                          </div>
                          <p className="text-sm text-slate-600">{step.stage || ruleLabel(step)}</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={step.status === "done"}
                            disabled={toggleDone.isPending}
                            onChange={(e) => toggleDone.mutate({ stepId: step.id, done: e.target.checked })} />
                          Done
                        </label>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        {TEXT_COLUMNS.filter(([key]) => step[key]).map(([key, label]) => (
                          <div key={key}>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                            <p className="whitespace-pre-line text-slate-700">{step[key]}</p>
                          </div>
                        ))}
                      </div>
                      {step.products.length > 0 && (
                        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Products</span>
                            {lineIds.length > 0 && (
                              <button type="button" onClick={() => toggle(lineIds, !allOn)} className="text-xs font-medium text-emerald-700 hover:underline">
                                {allOn ? "Untick all" : "Tick all for a quote"}
                              </button>
                            )}
                          </div>
                          {step.products.map((line) => (
                            <label key={line.id} className="flex items-start gap-2 text-sm">
                              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" disabled={!line.units}
                                checked={selected.has(line.id)} onChange={(e) => toggle([line.id], e.target.checked)} />
                              <span>
                                <span className="font-medium text-slate-800">{line.product_name}</span>
                                <span className="text-slate-600"> - {productAmount(line)}</span>
                                {line.note && <span className="text-slate-500"> ({line.note})</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="sticky -bottom-6 -mx-6 -mb-6 flex items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-3">
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

const ruleLabel = (step) => ruleText(step.anchor, step.offset_days);

const ProgramCard = ({ program, onOpen, onDelete }) => {
  const { data } = useSchedule(program.id);
  const next = data?.steps.find((s) => s.status !== "done");
  const progress = data?.progress;
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
            <span className="mt-1 block text-xs text-slate-500">{progress.done} of {progress.total} steps done</span>
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
  const suggestions = useMemo(() => groupNames(template), [template]);

  const create = useMutation({
    mutationFn: async ({ form, groups }) => {
      const created = (await apiClient.post("/programs/", { ...programPayload(form), client_id: Number(clientId) })).data;
      for (const g of groups) {
        await apiClient.post(`/programs/${created.id}/groups`, { program_id: created.id, ...g });
      }
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
          <ProgramForm initial={formFrom(null)} settings={template?.settings} suggestions={suggestions} withGroups
            submitting={create.isPending} onSubmit={(form, groups) => create.mutate({ form, groups })}
            onCancel={() => setCreating(false)} />
        )}
      </Modal>
      {openId && <ProgramDetail programId={openId} clientId={clientId} clientName={clientName} onClose={() => setOpenId(null)} />}
    </div>
  );
};

export default HerdingProgramPanel;
