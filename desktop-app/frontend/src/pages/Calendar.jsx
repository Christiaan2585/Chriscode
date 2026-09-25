import React, { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronLeft, ChevronRight, Clock, User, Dog, CheckCircle } from "lucide-react";
import apiClient from "../api/client";
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

  const days = monthGrid(month.year, month.month);
  const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedApps = byDay[selected] || [];
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

          <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 py-2">
            {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const key = dayKey(d);
              const apps = byDay[key] || [];
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
                  {apps.length > MAX_CHIPS && (
                    <span className="px-1.5 text-[11px] text-slate-500">+{apps.length - MAX_CHIPS} more</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-4 px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Upcoming</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Overdue</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Done</span>
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
            {selectedApps.length === 0 ? (
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
