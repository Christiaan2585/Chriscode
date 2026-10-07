import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { money } from "../utils/format";
import { GROUPS, STEP_STATUS, dayLabel, isMonday, ruleText, toInputDate } from "../utils/herding";

export const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const buttonClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
export const primary = `${buttonClass} bg-emerald-600 text-white shadow-sm hover:bg-emerald-700`;
export const secondary = `${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-600`;
export const linkButton = "text-xs font-medium text-emerald-700 hover:underline";

export const useTemplate = () =>
  useQuery({ queryKey: ["program-template"], queryFn: async () => (await apiClient.get("/programs/template")).data });

export const useSchedule = (programId) =>
  useQuery({
    queryKey: ["program-schedule", programId],
    queryFn: async () => (await apiClient.get(`/programs/${programId}/schedule`)).data,
  });

export const useProducts = () =>
  useQuery({ queryKey: ["products"], queryFn: async () => (await apiClient.get("/products/")).data });

export const ruleLabel = (step) => ruleText(step.anchor, step.offset_days);
// The next step to do: the medicine box ("none") has no date, so it's never "next".
export const nextStep = (steps) => steps?.find((s) => s.status !== "done" && s.status !== "none");
export const fileName = (text) => text.replace(/[\\/:*?"<>|]+/g, "");

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);

// The five headcounts (plus any other group a program already has).
export const HeadCountFields = ({ counts, onChange }) => (
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

export const countsFrom = (groups = []) => {
  const counts = Object.fromEntries(GROUPS.map((name) => [name, ""]));
  for (const g of groups) {
    const known = GROUPS.find((name) => name.toLowerCase() === g.animal_type.trim().toLowerCase());
    counts[known || g.animal_type] = String(g.group_size);
  }
  return counts;
};
export const countsPayload = (counts) =>
  ({ counts: Object.fromEntries(Object.entries(counts).map(([name, n]) => [name, Number(n) || 0])) });

// New program or editing one's dates. Blank numbers fall back to the master
// program's defaults (shown as placeholders).
export const ProgramForm = ({ initial, settings, withCounts, submitting, onSubmit, onCancel }) => {
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

export const programPayload = (form) => {
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

export const formFrom = (p) => ({
  name: p?.name || "",
  goal: p?.goal || "",
  mating_date: toInputDate(p?.mating_date),
  mating_weeks: p?.mating_weeks ?? "",
  weaning_rule: p?.weaning_rule || "",
  weaning_months: p?.weaning_months ?? "",
  weaning_days: p?.weaning_days ?? "",
});

export const StatusChip = ({ status }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STEP_STATUS[status].className}`}>
    {STEP_STATUS[status].label}
  </span>
);

// The step's date: worked out from the program, or typed in for this client.
export const StepDate = ({ step, onSave }) => {
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
const HerdingProgramPanel = ({ clientId }) => {
  const queryClient = useQueryClient();
  const key = ["programs", "client", String(clientId)];
  const { data: programs } = useQuery({
    queryKey: key,
    queryFn: async () => (await apiClient.get(`/programs/client/${clientId}`)).data,
  });
  const { data: template } = useTemplate();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const open = (programId) => navigate(`/programs/${programId}`); // pages/ProgramSheet.jsx

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
      open(created.id);
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
            <ProgramCard key={p.id} program={p} onOpen={() => open(p.id)}
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
    </div>
  );
};

export default HerdingProgramPanel;
