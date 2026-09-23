import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Dog, Activity, Scale, Calendar, Plus, Trash2, Check, StickyNote,
  Phone, MessageCircle, Edit, Briefcase, Mail, MapPin, ClipboardList,
  FileText, ShoppingCart, Download, ChevronRight, Clock, CheckCircle, Ban,
} from "lucide-react";
import { clientService, animalService } from "../api/services";
import apiClient from "../api/client";
import { toTelLink, toWhatsAppLink } from "../utils/contact";
import Modal from "../components/Modal";
import MedicalModal from "../components/MedicalModal";
import WeightModal from "../components/WeightModal";

const SPECIES_OPTIONS = ["Goats", "Sheep", "Cows", "Horses", "Pigs"];
// Youngest first, so the animal registry reads "young to old".
const AGE_GROUP_ORDER = ["Young", "Adult"];

const STATUS_STYLES = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-blue-100 text-blue-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Shipped: "bg-blue-100 text-blue-700",
  unpaid: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
};
const statusStyle = (s) => STATUS_STYLES[s] || "bg-slate-100 text-slate-700";
const money = (n) => `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ClientDetail = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const [isAnimalModalOpen, setIsAnimalModalOpen] = useState(false);
  const [newAnimal, setNewAnimal] = useState({ name: "", species: SPECIES_OPTIONS[0], breed: "" });
  const [editingAnimal, setEditingAnimal] = useState(null); // animal object being edited, or null
  const [animalForm, setAnimalForm] = useState(null);
  const [medicalTarget, setMedicalTarget] = useState(null);
  const [weightTarget, setWeightTarget] = useState(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteReminderDate, setNoteReminderDate] = useState("");
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const emptyAppointment = { animal_id: "", date: new Date().toISOString().split("T")[0], time: "09:00", reason: "", status: "scheduled" };
  const [newAppointment, setNewAppointment] = useState(emptyAppointment);

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => clientService.getById(id),
  });
  const { data: animals } = useQuery({
    queryKey: ["animals", "client", id],
    queryFn: async () => (await apiClient.get(`/animals/client/${id}`)).data,
  });
  const { data: notes } = useQuery({
    queryKey: ["notes", id],
    queryFn: async () => (await apiClient.get(`/notes/client/${id}`)).data,
  });
  const { data: programs } = useQuery({
    queryKey: ["programs", "client", id],
    queryFn: async () => (await apiClient.get(`/programs/client/${id}`)).data,
  });
  const { data: quotes } = useQuery({
    queryKey: ["quotes", "client", id],
    queryFn: async () => (await apiClient.get(`/quotes/client/${id}`)).data,
  });
  const { data: orders } = useQuery({
    queryKey: ["orders", "client", id],
    queryFn: async () => (await apiClient.get(`/orders/client/${id}`)).data,
  });
  const { data: invoices } = useQuery({
    queryKey: ["invoices", "client", id],
    queryFn: async () => (await apiClient.get(`/invoices/client/${id}`)).data,
  });
  const { data: appointments } = useQuery({
    queryKey: ["appointments", "client", id],
    queryFn: async () => (await apiClient.get(`/appointments/client/${id}`)).data,
  });

  const updateClientMutation = useMutation({
    mutationFn: (data) => clientService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", id] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setIsEditClientOpen(false);
    },
  });

  const addAnimalMutation = useMutation({
    mutationFn: (data) => animalService.create({ ...data, client_id: Number(id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animals", "client", id] });
      setIsAnimalModalOpen(false);
      setNewAnimal({ name: "", species: SPECIES_OPTIONS[0], breed: "" });
    },
  });

  const deleteAnimalMutation = useMutation({
    mutationFn: (animalId) => animalService.delete(animalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["animals", "client", id] }),
  });

  const updateAnimalMutation = useMutation({
    mutationFn: ({ animalId, data }) => animalService.update(animalId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animals", "client", id] });
      setEditingAnimal(null);
      setAnimalForm(null);
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (data) =>
      (
        await apiClient.post("/notes/", {
          client_id: Number(id),
          content: data.content,
          reminder_date: data.reminder_date || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
      setNoteContent("");
      setNoteReminderDate("");
    },
  });

  const completeNoteMutation = useMutation({
    mutationFn: async (noteId) => (await apiClient.patch(`/notes/${noteId}/complete`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", id] }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId) => (await apiClient.delete(`/notes/${noteId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", id] }),
  });

  const updateQuoteMutation = useMutation({
    mutationFn: async ({ quoteId, data }) => (await apiClient.put(`/quotes/${quoteId}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes", "client", id] }),
  });
  const deleteQuoteMutation = useMutation({
    mutationFn: async (quoteId) => (await apiClient.delete(`/quotes/${quoteId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes", "client", id] }),
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, data }) => (await apiClient.put(`/orders/${orderId}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders", "client", id] }),
  });
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId) => (await apiClient.delete(`/orders/${orderId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders", "client", id] }),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, data }) => (await apiClient.put(`/invoices/${invoiceId}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", "client", id] }),
  });
  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId) => (await apiClient.delete(`/invoices/${invoiceId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", "client", id] }),
  });

  const addAppointmentMutation = useMutation({
    mutationFn: async (data) =>
      (
        await apiClient.post("/appointments/", {
          client_id: Number(id),
          animal_id: data.animal_id === "" ? null : Number(data.animal_id),
          date: data.date,
          time: data.time,
          reason: data.reason,
          status: "scheduled",
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments", "client", id] });
      setIsScheduleModalOpen(false);
      setNewAppointment(emptyAppointment);
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ appointmentId, data }) => (await apiClient.put(`/appointments/${appointmentId}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments", "client", id] }),
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (appointmentId) => (await apiClient.delete(`/appointments/${appointmentId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments", "client", id] }),
  });

  const downloadInvoicePdf = async (invoiceId) => {
    const response = await apiClient.get(`/invoices/${invoiceId}/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice_${invoiceId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  if (clientLoading) return <div className="p-8 text-center">Loading client details...</div>;
  if (!client) return <div className="p-8 text-center">Client not found.</div>;

  const clientAnimals = animals || [];
  const openNotes = (notes || []).filter((n) => !n.is_completed);
  const doneNotes = (notes || []).filter((n) => n.is_completed);
  const telLink = toTelLink(client.phone);
  const waLink = toWhatsAppLink(client.phone, `Hi ${client.name?.split(" ")[0] || ""}, `);

  const speciesCounts = clientAnimals.reduce((acc, a) => {
    acc[a.species] = (acc[a.species] || 0) + 1;
    return acc;
  }, {});

  // Animals grouped young-to-old, then by species/type within each age group,
  // per the "categories (young to old)(breed/type)" layout.
  const animalGroups = AGE_GROUP_ORDER.map((ageGroup) => {
    const inGroup = clientAnimals.filter((a) => (a.age_group || "Adult") === ageGroup);
    const bySpecies = inGroup.reduce((acc, a) => {
      const key = a.species || "Other";
      (acc[key] = acc[key] || []).push(a);
      return acc;
    }, {});
    return {
      ageGroup,
      count: inGroup.length,
      species: Object.entries(bySpecies).sort(([a], [b]) => a.localeCompare(b)),
    };
  }).filter((g) => g.count > 0);

  const upcomingAppointments = (appointments || [])
    .slice()
    .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`));

  const openEditClient = () => {
    setClientForm({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      farm_name: client.farm_name || "",
    });
    setIsEditClientOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/clients" className="p-2 rounded-full hover:bg-slate-200 transition-colors text-slate-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-3xl font-bold text-slate-800">{client.name}</h2>
            <p className="text-slate-500">{client.farm_name || "Client Profile & History"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {telLink && (
            <a href={telLink} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm text-sm font-medium">
              <Phone size={18} /> Call
            </a>
          )}
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm text-sm font-medium">
              <MessageCircle size={18} /> WhatsApp
            </a>
          )}
          <button
            onClick={openEditClient}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm text-sm font-medium"
          >
            <Edit size={18} /> Edit Client
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: contact info + notes */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 border-b pb-2">Contact Information</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Briefcase size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">Farm / Business</span>
                  <span className="text-slate-700">{client.farm_name || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">Email</span>
                  <span className="text-slate-700">{client.email || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">Phone</span>
                  <span className="text-slate-700">{client.phone || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">Address</span>
                  <span className="text-slate-700">{client.address || "—"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
              <StickyNote size={18} className="text-emerald-600" /> Notes & Reminders
            </h3>
            <div className="space-y-2 mb-4">
              {openNotes.length === 0 && <p className="text-sm text-slate-400">No open notes.</p>}
              {openNotes.map((n) => (
                <div key={n.id} className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-slate-700">{n.content}</p>
                      {n.reminder_date && (
                        <p className="text-xs text-amber-600 mt-1">
                          Reminder: {new Date(n.reminder_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => completeNoteMutation.mutate(n.id)}
                        className="p-1 text-slate-400 hover:text-emerald-600"
                        title="Mark complete"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => deleteNoteMutation.mutate(n.id)}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {doneNotes.length > 0 && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer">{doneNotes.length} completed</summary>
                  <div className="space-y-1 mt-2">
                    {doneNotes.map((n) => (
                      <div key={n.id} className="line-through text-slate-400 flex justify-between">
                        <span>{n.content}</span>
                        <button onClick={() => deleteNoteMutation.mutate(n.id)} className="hover:text-red-600 no-underline">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <textarea
                placeholder="Add a note or reminder..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={noteReminderDate}
                  onChange={(e) => setNoteReminderDate(e.target.value)}
                  className="flex-1 p-2 border border-slate-200 rounded-lg text-xs"
                />
                <button
                  disabled={!noteContent || addNoteMutation.isPending}
                  onClick={() => addNoteMutation.mutate({ content: noteContent, reminder_date: noteReminderDate })}
                  className="bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Herding Programs */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
              <ClipboardList size={18} className="text-emerald-600" /> Herding Programs
            </h3>
            {(!programs || programs.length === 0) ? (
              <p className="text-sm text-slate-400">
                No programs assigned yet. Assign this client's animals to a program from the Herding Programs page.
              </p>
            ) : (
              <div className="space-y-2">
                {programs.map((p) => (
                  <div key={p.id} className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm">
                    <div className="font-medium text-slate-700">{p.name}</div>
                    {p.goal && <div className="text-xs text-slate-500 mt-0.5">{p.goal}</div>}
                    {(p.start_date || p.end_date) && (
                      <div className="text-xs text-slate-400 mt-1">
                        {p.start_date ? new Date(p.start_date).toLocaleDateString() : "—"}
                        {" → "}
                        {p.end_date ? new Date(p.end_date).toLocaleDateString() : "—"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Link
              to="/programs"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium"
            >
              Manage program assignments <ChevronRight size={14} />
            </Link>
          </div>
        </div>

        {/* Animals + history */}
        <div className="lg:col-span-2 space-y-6">
          {/* Animals */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Dog className="text-emerald-600" /> Registered Animals ({clientAnimals.length})
              </h3>
              <button
                onClick={() => setIsAnimalModalOpen(true)}
                className="text-sm bg-emerald-600 text-white px-3 py-1 rounded-md hover:bg-emerald-700 transition-colors"
              >
                + Add Animal
              </button>
            </div>

            {Object.keys(speciesCounts).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(speciesCounts).map(([species, count]) => (
                  <span
                    key={species}
                    className="bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1 rounded-full"
                  >
                    {species}: {count}
                  </span>
                ))}
              </div>
            )}

            {clientAnimals.length === 0 ? (
              <div className="bg-slate-100 p-12 rounded-2xl border-2 border-dashed border-slate-300 text-center text-slate-500">
                No animals registered for this client yet.
              </div>
            ) : (
              <div className="space-y-6">
                {animalGroups.map((group) => (
                  <div key={group.ageGroup}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">
                        {group.ageGroup}
                      </span>
                      <span className="text-xs text-slate-400">{group.count} animal{group.count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="space-y-4 pl-1 border-l-2 border-slate-100 ml-1">
                      {group.species.map(([species, animalsOfType]) => (
                        <div key={species} className="pl-4">
                          <div className="text-sm font-semibold text-slate-600 mb-2">
                            {species} <span className="text-slate-400 font-normal">({animalsOfType.length})</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {animalsOfType.map((animal) => (
                              <div
                                key={animal.id}
                                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all group"
                              >
                                <div className="flex justify-between items-start mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                                      <Dog size={20} />
                                    </div>
                                    <div>
                                      <div className="font-bold text-slate-800">{animal.name}</div>
                                      <div className="text-xs text-slate-500">{animal.breed || "Breed unknown"}{animal.gender ? ` • ${animal.gender}` : ""}</div>
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setMedicalTarget(animal)}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                      title="Medical Log"
                                    >
                                      <Activity size={16} />
                                    </button>
                                    <button
                                      onClick={() => setWeightTarget(animal)}
                                      className="p-1.5 text-slate-400 hover:text-purple-600 transition-colors"
                                      title="Weight Log"
                                    >
                                      <Scale size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingAnimal(animal);
                                        setAnimalForm({
                                          name: animal.name || "",
                                          species: animal.species || SPECIES_OPTIONS[0],
                                          age_group: animal.age_group || "Adult",
                                          breed: animal.breed || "",
                                          tag_id: animal.tag_id || "",
                                          gender: animal.gender || "",
                                        });
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                                      title="Edit"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm(`Remove ${animal.name}? This can't be undone.`)) {
                                          deleteAnimalMutation.mutate(animal.id);
                                        }
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-400 mt-4 pt-3 border-t border-slate-50">
                                  <Calendar size={12} /> Tag: {animal.tag_id || "unassigned"}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calendar / schedule */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="text-emerald-600" size={20} /> Calendar & Schedule ({upcomingAppointments.length})
              </h3>
              <button
                onClick={() => setIsScheduleModalOpen(true)}
                className="text-sm bg-emerald-600 text-white px-3 py-1 rounded-md hover:bg-emerald-700 transition-colors"
              >
                + Schedule Visit
              </button>
            </div>
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-slate-400">No appointments scheduled for this client yet.</p>
            ) : (
              <div className="space-y-2">
                {upcomingAppointments.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg text-sm">
                    <div className="flex items-center gap-4">
                      <div className="text-center bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 min-w-[64px]">
                        <div className="text-[10px] font-bold text-emerald-600 uppercase">
                          {new Date(app.date).toLocaleString("default", { month: "short" })}
                        </div>
                        <div className="text-lg font-black text-emerald-800 leading-none">{new Date(app.date).getDate()}</div>
                      </div>
                      <div>
                        <div className="font-medium text-slate-700">{app.reason || "Visit"}</div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock size={12} /> {app.time}
                          {app.animal_id && (
                            <span className="ml-1">
                              • {clientAnimals.find((a) => a.id === app.animal_id)?.name || `Animal #${app.animal_id}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-bold rounded-full px-2 py-1 ${
                        app.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                        app.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {app.status}
                      </span>
                      <button
                        onClick={() => updateAppointmentMutation.mutate({ appointmentId: app.id, data: { ...app, status: "completed" } })}
                        disabled={app.status === "completed"}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Mark completed"
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={() => updateAppointmentMutation.mutate({ appointmentId: app.id, data: { ...app, status: "cancelled" } })}
                        disabled={app.status === "cancelled"}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Cancel"
                      >
                        <Ban size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete this appointment? This can't be undone.`)) {
                            deleteAppointmentMutation.mutate(app.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/calendar" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              Open full calendar <ChevronRight size={14} />
            </Link>
          </div>

          {/* Quotes history */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <FileText className="text-emerald-600" size={20} /> Quotes ({(quotes || []).length})
            </h3>
            {(!quotes || quotes.length === 0) ? (
              <p className="text-sm text-slate-400">No quotes for this client yet.</p>
            ) : (
              <div className="space-y-2">
                {quotes
                  .slice()
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((q) => (
                    <div key={q.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg text-sm">
                      <div>
                        <div className="font-medium text-slate-700">Quote #{q.id} — {money(q.total_amount)}</div>
                        <div className="text-xs text-slate-400">{new Date(q.date).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={q.status}
                          onChange={(e) => updateQuoteMutation.mutate({ quoteId: q.id, data: { ...q, status: e.target.value } })}
                          className={`text-xs font-bold rounded-full px-2 py-1 border-0 outline-none ${statusStyle(q.status)}`}
                        >
                          <option value="Draft">Draft</option>
                          <option value="Sent">Sent</option>
                          <option value="Accepted">Accepted</option>
                        </select>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete quote #${q.id}? This can't be undone.`)) {
                              deleteQuoteMutation.mutate(q.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <Link to="/quotes" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              Full item detail & new quotes <ChevronRight size={14} />
            </Link>
          </div>

          {/* Orders history */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <ShoppingCart className="text-emerald-600" size={20} /> Orders ({(orders || []).length})
            </h3>
            {(!orders || orders.length === 0) ? (
              <p className="text-sm text-slate-400">No orders for this client yet.</p>
            ) : (
              <div className="space-y-2">
                {orders
                  .slice()
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((o) => (
                    <div key={o.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg text-sm">
                      <div>
                        <div className="font-medium text-slate-700">Order #{o.id} — {money(o.total_amount)}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(o.date).toLocaleDateString()}{o.quote_id ? ` • from Quote #${o.quote_id}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={o.status}
                          onChange={(e) => updateOrderMutation.mutate({ orderId: o.id, data: { ...o, status: e.target.value } })}
                          className={`text-xs font-bold rounded-full px-2 py-1 border-0 outline-none ${statusStyle(o.status)}`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Paid">Paid</option>
                          <option value="Shipped">Shipped</option>
                        </select>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete order #${o.id}? This can't be undone.`)) {
                              deleteOrderMutation.mutate(o.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <Link to="/orders" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              Manage all orders <ChevronRight size={14} />
            </Link>
          </div>

          {/* Invoices history */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <FileText className="text-emerald-600" size={20} /> Invoices ({(invoices || []).length})
            </h3>
            {(!invoices || invoices.length === 0) ? (
              <p className="text-sm text-slate-400">No invoices for this client yet.</p>
            ) : (
              <div className="space-y-2">
                {invoices
                  .slice()
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg text-sm">
                      <div>
                        <div className="font-medium text-slate-700">Invoice #{inv.id} — {money(inv.total_amount)}</div>
                        <div className="text-xs text-slate-400">{new Date(inv.date).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={inv.status}
                          onChange={(e) => updateInvoiceMutation.mutate({ invoiceId: inv.id, data: { ...inv, status: e.target.value } })}
                          className={`text-xs font-bold rounded-full px-2 py-1 border-0 outline-none ${statusStyle(inv.status)}`}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <button
                          onClick={() => downloadInvoicePdf(inv.id)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                          title="Download PDF"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete invoice #${inv.id}? This can't be undone.`)) {
                              deleteInvoiceMutation.mutate(inv.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <Link to="/invoices" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              Create a new invoice <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      <Modal isOpen={isAnimalModalOpen} onClose={() => setIsAnimalModalOpen(false)} title={`Add Animal for ${client.name}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Animal Name</label>
            <input
              type="text"
              value={newAnimal.name}
              onChange={(e) => setNewAnimal({ ...newAnimal, name: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Species</label>
              <select
                value={newAnimal.species}
                onChange={(e) => setNewAnimal({ ...newAnimal, species: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {SPECIES_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Breed</label>
              <input
                type="text"
                value={newAnimal.breed}
                onChange={(e) => setNewAnimal({ ...newAnimal, breed: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <button
            disabled={!newAnimal.name || addAnimalMutation.isPending}
            onClick={() => addAnimalMutation.mutate(newAnimal)}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {addAnimalMutation.isPending ? "Saving..." : "Register Animal"}
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!editingAnimal} onClose={() => { setEditingAnimal(null); setAnimalForm(null); }} title={`Edit ${editingAnimal?.name || "Animal"}`}>
        {animalForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Animal Name</label>
                <input
                  type="text"
                  value={animalForm.name}
                  onChange={(e) => setAnimalForm({ ...animalForm, name: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Species</label>
                <select
                  value={animalForm.species}
                  onChange={(e) => setAnimalForm({ ...animalForm, species: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {SPECIES_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Breed</label>
                <input
                  type="text"
                  value={animalForm.breed}
                  onChange={(e) => setAnimalForm({ ...animalForm, breed: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tag / Ear Tag ID</label>
                <input
                  type="text"
                  value={animalForm.tag_id}
                  onChange={(e) => setAnimalForm({ ...animalForm, tag_id: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <button
              disabled={!animalForm.name || updateAnimalMutation.isPending}
              onClick={() => updateAnimalMutation.mutate({ animalId: editingAnimal.id, data: { ...animalForm, client_id: Number(id) } })}
              className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {updateAnimalMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={isEditClientOpen} onClose={() => setIsEditClientOpen(false)} title="Edit Client">
        {clientForm && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Farm / Business Name</label>
              <input
                type="text"
                value={clientForm.farm_name}
                onChange={(e) => setClientForm({ ...clientForm, farm_name: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={clientForm.email}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cell / WhatsApp Number</label>
                <input
                  type="tel"
                  value={clientForm.phone}
                  onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Physical Address</label>
              <textarea
                value={clientForm.address}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                rows="3"
              />
            </div>
            <button
              disabled={!clientForm.name || updateClientMutation.isPending}
              onClick={() => updateClientMutation.mutate(clientForm)}
              className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {updateClientMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} title={`Schedule Visit for ${client.name}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={newAppointment.date}
                onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                value={newAppointment.time}
                onChange={(e) => setNewAppointment({ ...newAppointment, time: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Animal (Optional)</label>
            <select
              value={newAppointment.animal_id}
              onChange={(e) => setNewAppointment({ ...newAppointment, animal_id: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">Whole herd / general visit</option>
              {clientAnimals.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.species})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Visit</label>
            <textarea
              value={newAppointment.reason}
              onChange={(e) => setNewAppointment({ ...newAppointment, reason: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              rows={3}
              placeholder="e.g. Monthly vaccination"
            />
          </div>
          <button
            disabled={!newAppointment.reason || addAppointmentMutation.isPending}
            onClick={() => addAppointmentMutation.mutate(newAppointment)}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {addAppointmentMutation.isPending ? "Saving..." : "Schedule Visit"}
          </button>
        </div>
      </Modal>

      {medicalTarget && (
        <MedicalModal
          isOpen={!!medicalTarget}
          onClose={() => setMedicalTarget(null)}
          animalId={medicalTarget.id}
          animalName={medicalTarget.name}
        />
      )}
      {weightTarget && (
        <WeightModal
          isOpen={!!weightTarget}
          onClose={() => setWeightTarget(null)}
          animalId={weightTarget.id}
          animalName={weightTarget.name}
        />
      )}
    </div>
  );
};

export default ClientDetail;
