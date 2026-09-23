import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar as CalIcon, Clock, User, Dog, CheckCircle } from "lucide-react";
import apiClient from "../api/client";
import { clientService, animalService } from "../api/services";
import Modal from "../components/Modal";
import SearchableSelect from "../components/SearchableSelect";

const Calendar = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newApp, setNewApp] = useState({
    client_id: "",
    animal_id: "",
    date: new Date().toISOString().split('T')[0],
    time: "09:00",
    reason: "",
    status: "scheduled"
  });

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const response = await apiClient.get("/appointments/");
      return response.data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post("/appointments/", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsModalOpen(false);
      setNewApp({
        client_id: "",
        animal_id: "",
        date: new Date().toISOString().split('T')[0],
        time: "09:00",
        reason: "",
        status: "scheduled"
      });
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: clientService.getAll,
  });
  const clientName = (id) => clients?.find((c) => c.id === Number(id))?.name || `Client #${id}`;

  const { data: animals } = useQuery({
    queryKey: ["animals"],
    queryFn: animalService.getAll,
  });
  const animalsForClient = (clientId) =>
    (animals || []).filter((a) => String(a.client_id) === String(clientId));
  const animalName = (id) => animals?.find((a) => a.id === Number(id))?.name || `Animal #${id}`;

  const completeMutation = useMutation({
    mutationFn: async (appointment) => {
      const response = await apiClient.put(`/appointments/${appointment.id}`, {
        ...appointment,
        status: "completed",
      });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments"] }),
  });

  if (isLoading) return <div className="p-8 text-center">Loading appointments...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">System Calendar</h2>
          <p className="text-slate-500">Schedule and track animal health visits</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Schedule Appointment
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 text-slate-600">
            <CalIcon size={20} />
            <span className="font-semibold">Upcoming Appointments</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {appointments?.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No appointments scheduled.</div>
          ) : (
            appointments?.map(app => (
              <div key={app.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-6">
                  <div className="text-center bg-emerald-50 p-3 rounded-xl border border-emerald-100 min-w-[80px]">
                    <div className="text-xs font-bold text-emerald-600 uppercase">{new Date(app.date).toLocaleString('default', { month: 'short' })}</div>
                    <div className="text-2xl font-black text-emerald-800">{new Date(app.date).getDate()}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">{app.time}</span>
                    </div>
                    <div className="text-lg font-bold text-slate-800">{app.reason}</div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1"><User size={14} /> {clientName(app.client_id)}</div>
                      {app.animal_id && <div className="flex items-center gap-1"><Dog size={14} /> {animalName(app.animal_id)}</div>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${app.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {app.status}
                  </span>
                  <button
                    onClick={() => completeMutation.mutate(app)}
                    disabled={app.status === "completed"}
                    className="p-2 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={app.status === "completed" ? "Already completed" : "Mark as completed"}
                  >
                    <CheckCircle size={20} />
                  </button>
                </div>
              </div>
            ))
          )}
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
            disabled={!newApp.client_id || !newApp.reason || addMutation.isPending}
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
