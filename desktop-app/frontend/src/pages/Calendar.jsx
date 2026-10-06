import React, { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, ChevronLeft, ChevronRight, Clock, User, Dog, CheckCircle, ClipboardList } from "lucide-react";
import apiClient from "../api/client";
import { STEP_STATUS, TEXT_COLUMNS, ruleText } from "../utils/herding";
import { clientService, animalService } from "../api/services";
import Modal from "../components/Modal";
import SearchableSelect from "../components/SearchableSelect";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 2;

const pad = (n) => String(n).padStart(2, "0");
// Local-date key (YYYY-MM-DD). Appointment dates arrive as naive ISO
// strings, so their first 10 characters are already in this form -
// comparing strings avoids any timezone shift from Date parsing.
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dayKey(new Date());

// Weeks (Monday first) covering the given month, padded with the days of
// the neighbouring months so every row is a full week.
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil(((first.getDay() + 6) % 7 + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const statusOf = (app, today) =>
  app.status === "completed" ? "completed" : app.date.slice(0, 10) < today ? "overdue" : "scheduled";

const CHIP = {
  scheduled: "bg-emerald-100 text-emerald-800",
  overdue: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
};

const PLAN_KEY = "sandveld_calendar_plan_mating_date";
const readPlanDate = () => {
  try {
    return localStorage.getItem(PLAN_KEY) || "";
  } catch {
    return "";
  }
};

const emptyAppointment = (date) => ({ client_id: "", animal_id: "", date, time: "09:00", reason: "", status: "scheduled" });

const Calendar = () => {
  const queryClient = useQueryClient();
  const today = todayKey();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newApp, setNewApp] = useState(emptyAppointment(today));

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => (await apiClient.get("/appointments/")).data,
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.getAll });
  const { data: animals } = useQuery({ queryKey: ["animals"], queryFn: animalService.getAll });

  const clientName = (id) => clients?.find((c) => c.id === Number(id))?.name || `Client #${id}`;
  const animalName = (id) => animals?.find((a) => a.id === Number(id))?.name || `Animal #${id}`;
  const animalsForClient = (clientId) => (animals || []).filter((a) => String(a.client_id) === String(clientId));

  const byDay = useMemo(() => {
    const map = {};
    for (const app of appointments || []) {
      (map[app.date.slice(0, 10)] ||= []).push(app);
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [appointments]);

  // Herding program steps of every client's program, for the weeks on screen.
  const days = useMemo(() => monthGrid(month.year, month.month), [month]);
  const range = { start: dayKey(days[0]), end: dayKey(days[days.length - 1]) };
  const { data: programSteps } = useQuery({
    queryKey: ["program-calendar", range.start, range.end],
    queryFn: async () => (await apiClient.get("/programs/calendar", { params: range })).data,
  });
  const stepsByDay = useMemo(() => {
    const map = {};
    for (const step of programSteps || []) (map[step.date] ||= []).push(step);
    return map;
  }, [programSteps]);

  // "Plan the master program": the master herding program laid out from a
  // chosen first mating day, no client needed. Remembered on this computer.
  const [planDate, setPlanDate] = useState(readPlanDate);
  const { data: plan } = useQuery({
    queryKey: ["program-template", planDate],
    queryFn: async () => (await apiClient.get("/programs/template", { params: { mating_date: planDate } })).data,
    enabled: Boolean(planDate),
  });
  const planByDay = useMemo(() => {
    const map = {};
    if (planDate) for (const step of plan?.steps || []) if (step.date) (map[String(step.date).slice(0, 10)] ||= []).push(step);
    return map;
  }, [plan, planDate]);
  const choosePlanDate = (value) => {
    setPlanDate(value);
    try {
      if (value) localStorage.setItem(PLAN_KEY, value);
      else localStorage.removeItem(PLAN_KEY);
    } catch {
      // Storage blocked - the plan just isn't remembered.
    }
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      d.setMonth(d.getMonth() - 2); // the program starts about 8 weeks before mating
      setMonth({ year: d.getFullYear(), month: d.getMonth() });
    }
  };

  const addMutation = useMutation({
    mutationFn: async (data) =>
      (await apiClient.post("/appointments/", {
        ...data,
        client_id: Number(data.client_id),
        animal_id: data.animal_id === "" ? null : Number(data.animal_id),
      })).data,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsModalOpen(false);
      setSelected(created.date.slice(0, 10));
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (appointment) =>
      (await apiClient.put(`/appointments/${appointment.id}`, { ...appointment, status: "completed" })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments"] }),
  });

  // Below 2xl the agenda sits under the calendar; bring it into view
  // only if it isn't already (block: "nearest" doesn't scroll otherwise).
  const agendaRef = useRef(null);
  const selectDay = (key) => {
    setSelected(key);
    agendaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const openSchedule = (date) => {
    setNewApp(emptyAppointment(date));
    setIsModalOpen(true);
  };

  const shiftMonth = (delta) =>
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const goToday = () => {
    const now = new Date();
    setMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelected(today);
  };

  if (isLoading) return <div className="p-8 text-center">Loading appointments...</div>;

  const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedApps = byDay[selected] || [];
  const selectedSteps = stepsByDay[selected] || [];
  const selectedPlan = planByDay[selected] || [];
  const selectedLabel = new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">System Calendar</h2>
          <p className="text-slate-500">Schedule and track animal health visits</p>
        </div>
        <button
          onClick={() => openSchedule(selected)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Schedule Appointment
        </button>
      </div>

      <div className="flex flex-col 2xl:flex-row gap-6 items-start">
        <div className="flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <ChevronRight size={18} />
              </button>
              <h3 className="ml-2 text-lg font-semibold text-slate-800 whitespace-nowrap">{monthLabel}</h3>
            </div>
            <button type="button" onClick={goToday}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Today
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-600">
            <ClipboardList size={16} className="text-emerald-600" aria-hidden="true" />
            <label className="flex flex-wrap items-center gap-2">
              Plan the master herding program with a first mating day of
              <input type="date" value={planDate} onChange={(e) => choosePlanDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
            {planDate && (
              <button type="button" onClick={() => choosePlanDate("")} className="text-xs font-medium text-slate-500 hover:text-red-600">
                Clear plan
              </button>
            )}
            {planDate && plan && !plan.steps.length && (
              <span className="text-xs text-amber-700">The master program has no steps yet - import it under Herding Program.</span>
            )}
          </div>

          <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 py-2">
            {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const key = dayKey(d);
              const apps = byDay[key] || [];
              const steps = (stepsByDay[key] || []).slice(0, Math.max(0, MAX_CHIPS - apps.length));
              const plans = (planByDay[key] || []).slice(0, Math.max(0, MAX_CHIPS - apps.length - steps.length));
              const total = apps.length + (stepsByDay[key] || []).length + (planByDay[key] || []).length;
              const hidden = total - Math.min(apps.length, MAX_CHIPS) - steps.length - plans.length;
              const inMonth = d.getMonth() === month.month;
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDay(key)}
                  onDoubleClick={() => openSchedule(key)}
                  title="Double-click to schedule on this day"
                  className={`min-h-24 p-1.5 flex flex-col gap-1 text-left border-t border-l border-slate-100 transition-colors
                    ${inMonth ? "" : "bg-slate-50 text-slate-400"}
                    ${isSelected ? "ring-2 ring-inset ring-emerald-500" : "hover:bg-slate-50"}`}
                >
                  <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold
                    ${key === today ? "bg-emerald-600 text-white" : inMonth ? "text-slate-700" : ""}`}>
                    {d.getDate()}
                  </span>
                  {apps.slice(0, MAX_CHIPS).map((app) => (
                    <span key={app.id} title={`${app.time}  ${app.reason} - ${clientName(app.client_id)}`}
                      className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${CHIP[statusOf(app, today)]}`}>
                      {app.reason}
                    </span>
                  ))}
                  {steps.map((step) => (
                    <span key={`${step.program_id}-${step.step_id}`} title={`${step.client_name}: ${step.stage || step.program_name}`}
                      className={`truncate rounded border-l-2 border-emerald-500 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ${step.status === "done" ? "line-through opacity-60" : ""}`}>
                      {step.client_name}: {step.stage || step.program_name}
                    </span>
                  ))}
                  {plans.map((step) => (
                    <span key={`plan-${step.id}`} title={`Master program (plan): ${step.stage || ruleText(step.anchor, step.offset_days)}`}
                      className="truncate rounded border border-dashed border-emerald-500 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                      {step.stage || ruleText(step.anchor, step.offset_days)}
                    </span>
                  ))}
                  {hidden > 0 && (
                    <span className="px-1.5 text-[11px] text-slate-500">+{hidden} more</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-4 px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Upcoming</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Overdue</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Done</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border-l-2 border-emerald-500 bg-slate-200" />Herding program</span>
            {planDate && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border border-dashed border-emerald-500" />Master program (plan)</span>}
          </div>
        </div>

        <div ref={agendaRef} className="w-full 2xl:w-80 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {selected === today ? "Today" : "Selected day"}
            </p>
            <h3 className="text-base font-semibold text-slate-800">{selectedLabel}</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {selectedApps.length === 0 && selectedSteps.length === 0 && selectedPlan.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing scheduled.</p>
            ) : (
              selectedApps.map((app) => {
                const status = statusOf(app, today);
                return (
                  <div key={app.id} className="px-5 py-4 flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Clock size={14} /> {app.time}
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${CHIP[status]}`}>{status}</span>
                      </div>
                      <p className="font-semibold text-slate-800">{app.reason}</p>
                      <p className="flex items-center gap-1 text-sm text-slate-500"><User size={14} /> {clientName(app.client_id)}</p>
                      {app.animal_id && (
                        <p className="flex items-center gap-1 text-sm text-slate-500"><Dog size={14} /> {animalName(app.animal_id)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => completeMutation.mutate(app)}
                      disabled={app.status === "completed"}
                      className="p-2 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={app.status === "completed" ? "Already completed" : "Mark as completed"}
                    >
                      <CheckCircle size={20} />
                    </button>
                  </div>
                );
              })
            )}
            {selectedSteps.map((step) => (
              <div key={`${step.program_id}-${step.step_id}`} className="px-5 py-4 space-y-1">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ClipboardList size={14} /> Herding program
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STEP_STATUS[step.status].className}`}>
                    {STEP_STATUS[step.status].label}
                  </span>
                </div>
                <p className="font-semibold text-slate-800">{step.stage || step.program_name}</p>
                <Link to={`/clients/${step.client_id}`} className="flex items-center gap-1 text-sm text-emerald-700 hover:underline">
                  <User size={14} /> {step.client_name} - {step.program_name}
                </Link>
              </div>
            ))}
            {selectedPlan.map((step) => (
              <div key={`plan-${step.id}`} className="px-5 py-4 space-y-1">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ClipboardList size={14} /> Master program (plan)
                </div>
                <p className="font-semibold text-slate-800">{step.stage || ruleText(step.anchor, step.offset_days)}</p>
                <p className="text-xs text-slate-500">{ruleText(step.anchor, step.offset_days)}</p>
                {TEXT_COLUMNS.filter(([key]) => step[key]).map(([key, label]) => (
                  <div key={key} className="text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                    <p className="whitespace-pre-line text-slate-700">{step[key]}</p>
                  </div>
                ))}
                {step.products?.length > 0 && (
                  <p className="text-xs text-slate-600">
                    Products: {step.products.map((p) => `${p.product_name}${p.dose ? ` (${p.dose} ${p.unit} each${p.animal_group ? `, ${p.animal_group}` : ""})` : ""}`).join("; ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-slate-100">
            <button type="button" onClick={() => openSchedule(selected)}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <Plus size={16} /> Schedule on this day
            </button>
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Schedule Appointment">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
              <SearchableSelect
                value={newApp.client_id}
                onChange={(v) => setNewApp({ ...newApp, client_id: v, animal_id: "" })}
                options={(clients || []).map((c) => ({ value: c.id, label: c.name, sublabel: c.farm_name }))}
                placeholder="Select a client…"
                searchPlaceholder="Search clients…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Animal (Optional)</label>
              <select
                value={newApp.animal_id}
                onChange={e => setNewApp({...newApp, animal_id: e.target.value})}
                disabled={!newApp.client_id}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">
                  {newApp.client_id ? "None" : "Select a client first"}
                </option>
                {animalsForClient(newApp.client_id).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={newApp.date}
                onChange={e => setNewApp({...newApp, date: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                value={newApp.time}
                onChange={e => setNewApp({...newApp, time: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Visit</label>
            <textarea
              value={newApp.reason}
              onChange={e => setNewApp({...newApp, reason: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              rows="3"
              placeholder="e.g. Monthly vaccination"
            ></textarea>
          </div>
          <button
            disabled={!newApp.client_id || !newApp.reason || !newApp.date || addMutation.isPending}
            onClick={() => addMutation.mutate(newApp)}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? "Scheduling..." : "Schedule Visit"}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Calendar;
