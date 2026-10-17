import { dateLocale, t } from "../utils/i18n";
import { deleteConfirm } from "../utils/confirmText";
import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, Plus, Trash2, Check, StickyNote,
  Phone, MessageCircle, Edit, Briefcase, Mail, MapPin,
  FileText, ShoppingCart, Download, Eye, BookOpen, ChevronRight, Clock, CheckCircle, Ban, PawPrint, Pencil, Home,
} from "lucide-react";
import { clientService } from "../api/services";
import apiClient from "../api/client";
import { toTelLink, toWhatsAppLink } from "../utils/contact";
import Modal from "../components/Modal";
import DocumentPreview from "../components/DocumentPreview";
import TreatmentReminder from "../components/TreatmentReminder";
import HerdingProgramPanel from "../components/HerdingProgramPanel";
import TaxCertificate from "../components/TaxCertificate";
import RamsPanel from "../components/RamsPanel";
import ClientPhotos from "../components/ClientPhotos";
import { loadedLanguages, useSupplierBook } from "../components/SupplierCatalogue";
import { DocumentHover } from "../components/PreviewCards";
import { downloadDocumentPdf, orderFormFor, invoiceDoc, quoteDoc, markQuoteSent, statementFor } from "../utils/documents";
import { farmLabel, money, statusStyle } from "../utils/format";


const CALL_QUICK = ["Phoned - no answer", "Phoned - will pay", "Phoned - wants a quote", "Phoned - order placed"];

const ClientDetail = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(null);
  const { data: book } = useSupplierBook();
  const bookLanguages = loadedLanguages(book);

  const [noteContent, setNoteContent] = useState("");
  const [noteReminderDate, setNoteReminderDate] = useState("");
  const [noteKind, setNoteKind] = useState(""); // "call" when logging a phone call
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const emptyAppointment = { animal_id: "", date: new Date().toISOString().split("T")[0], time: "09:00", reason: "", status: "scheduled" };
  const [newAppointment, setNewAppointment] = useState(emptyAppointment);
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);

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
  const { data: summary } = useQuery({
    queryKey: ["clients", id, "summary"],
    queryFn: async () => (await apiClient.get(`/clients/${id}/summary`)).data,
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

  const addNoteMutation = useMutation({
    mutationFn: async (data) =>
      (
        await apiClient.post("/notes/", {
          client_id: Number(id),
          content: data.content,
          reminder_date: data.reminder_date || null,
          kind: data.kind || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
      setNoteContent("");
      setNoteReminderDate("");
      setNoteKind("");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", "client", id] });
      // A herding program's quote is the program: its card must follow.
      queryClient.invalidateQueries({ queryKey: ["program-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["programs"] });
    },
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

  // Every appointment change refreshes the calendar as well as this page.
  const refreshAppointments = () => queryClient.invalidateQueries({ queryKey: ["appointments"] });

  const saveAppointmentMutation = useMutation({
    mutationFn: async (data) => {
      const body = {
        client_id: Number(id),
        animal_id: data.animal_id === "" || data.animal_id == null ? null : Number(data.animal_id),
        date: data.date,
        time: data.time,
        reason: data.reason,
        status: data.status || "scheduled",
      };
      return editingAppointmentId
        ? (await apiClient.put(`/appointments/${editingAppointmentId}`, body)).data
        : (await apiClient.post("/appointments/", body)).data;
    },
    onSuccess: () => {
      refreshAppointments();
      closeScheduleModal();
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ appointmentId, data }) => (await apiClient.put(`/appointments/${appointmentId}`, data)).data,
    onSuccess: refreshAppointments,
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (appointmentId) => (await apiClient.delete(`/appointments/${appointmentId}`)).data,
    onSuccess: refreshAppointments,
  });

  if (clientLoading) return <div className="p-8 text-center">{t("Loading client details...")}</div>;
  if (!client) return <div className="p-8 text-center">{t("Client not found.")}</div>;

  const clientAnimals = animals || [];
  const openNotes = (notes || []).filter((n) => !n.is_completed);
  const doneNotes = (notes || []).filter((n) => n.is_completed);
  const telLink = toTelLink(client.phone);
  const waLink = toWhatsAppLink(client.phone, `Hi ${client.name?.split(" ")[0] || ""}, `);

  const upcomingAppointments = (appointments || [])
    .slice()
    .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`));

  function closeScheduleModal() {
    setIsScheduleModalOpen(false);
    setEditingAppointmentId(null);
    setNewAppointment(emptyAppointment);
  }
  const openEditAppointment = (app) => {
    setEditingAppointmentId(app.id);
    setNewAppointment({
      animal_id: app.animal_id ?? "",
      date: String(app.date).slice(0, 10),
      time: app.time || "09:00",
      reason: app.reason || "",
      status: app.status,
    });
    setIsScheduleModalOpen(true);
  };

  const farmAnimals = summary?.farm_animals || [];
  const farmAnimalTotal = summary?.farm_animal_total || 0;

  const openEditClient = () => {
    setClientForm({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      postal_address: client.postal_address || "",
      vat_number: client.vat_number || "",
      farm_name: client.farm_name || "",
    });
    setIsEditClientOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/clients" className="p-2 rounded-full hover:bg-slate-200 transition-colors text-slate-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-3xl font-bold text-slate-800">{farmLabel(client)}</h2>
            <p className="text-slate-500">
              {client.farm_name ? `Contact: ${client.name}` : "Farm profile & history"}
              {farmAnimalTotal > 0 && <> · {farmAnimalTotal.toLocaleString()} animals</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {telLink && (
            <a href={telLink} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm text-sm font-medium">
              <Phone size={18} /> {t("Call")}
            </a>
          )}
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm text-sm font-medium">
              <MessageCircle size={18} /> WhatsApp
            </a>
          )}
          {(bookLanguages.length ? bookLanguages : [null]).map((lang) => (
            <button
              key={lang || "own"}
              type="button"
              onClick={() => setPreview(orderFormFor(client, lang))}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm text-sm font-medium"
            >
              <BookOpen size={18} /> {lang === "af" ? "Bestelvorm (Afrikaans)" : lang === "en" ? "Order form (English)" : "Order form"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreview(statementFor(client))}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm text-sm font-medium"
          >
            <FileText size={18} /> {t("Statement")}
          </button>
          <TreatmentReminder client={client} />
          <button
            onClick={openEditClient}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm text-sm font-medium"
          >
            <Edit size={18} /> {t("Edit Client")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: contact info + notes */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
              <Home size={18} className="text-emerald-600" /> {t("The farm")}
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <PawPrint size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">{t("Animals on the farm")}</span>
                  {farmAnimalTotal > 0 ? (
                    <>
                      <span className="text-2xl font-bold text-slate-800 leading-tight">{farmAnimalTotal.toLocaleString()}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {farmAnimals.map((g) => (
                          <span key={g.animal_type} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {g.animal_type} × {g.group_size}
                          </span>
                        ))}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-slate-500">{t("Not counted yet - fill in the animal numbers on a herding program below.")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">{t("Contact person")}</span>
                  <span className="text-slate-700">{client.name}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">{t("Phone")}</span>
                  <span className="text-slate-700">{client.phone || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">{t("Email")}</span>
                  <span className="text-slate-700 break-all">{client.email || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase font-bold">{t("Farm address")}</span>
                  <span className="whitespace-pre-line text-slate-700">{client.address || "—"}</span>
                </div>
              </div>
              {client.postal_address && (
                <div className="flex items-start gap-3">
                  <Mail size={16} className="text-slate-400 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-bold">{t("Postal address")}</span>
                    <span className="whitespace-pre-line text-slate-700">{client.postal_address}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <RamsPanel clientId={id} />
          <TaxCertificate clientId={id} clientName={farmLabel(client)} />
          <ClientPhotos clientId={id} />

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
              <StickyNote size={18} className="text-emerald-600" /> {t("Notes & Reminders")}
            </h3>
            <div className="space-y-2 mb-4">
              {openNotes.length === 0 && <p className="text-sm text-slate-400">{t("No open notes.")}</p>}
              {openNotes.map((n) => (
                <div key={n.id} className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        {n.kind === "call" && <><Phone size={12} className="mr-1 inline" aria-hidden="true" />{t("Call")} · </>}
                        {n.author ? `${n.author} · ` : ""}{n.created_at ? new Date(n.created_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" }) : ""}
                      </p>
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
                        title={t("Mark complete")}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => deleteNoteMutation.mutate(n.id)}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title={t("Delete")}
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
              <div className="flex flex-wrap gap-1" role="group" aria-label={t("Log a call")}>
                {CALL_QUICK.map((text) => (
                  <button key={text} type="button" onClick={() => { setNoteKind("call"); setNoteContent(text); }}
                    className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
                    <Phone size={11} aria-hidden="true" /> {t(text)}
                  </button>
                ))}
              </div>
              <textarea
                placeholder={noteKind === "call" ? t("What was said on the call?") : t("Add a note or reminder...")}
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
                  onClick={() => addNoteMutation.mutate({ content: noteContent, reminder_date: noteReminderDate, kind: noteKind })}
                  className="bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {noteKind === "call" ? t("Log call") : t("Add")}
                </button>
              </div>
            </div>
          </div>

          <HerdingProgramPanel clientId={id} clientName={farmLabel(client)} />
        </div>

        {/* History */}
        <div className="lg:col-span-2 space-y-6">
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
                {t("+ Schedule Visit")}
              </button>
            </div>
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-slate-400">{t("No appointments scheduled for this client yet.")}</p>
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
                        onClick={() => openEditAppointment(app)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                        title={t("Change date, time or reason")}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => updateAppointmentMutation.mutate({ appointmentId: app.id, data: { ...app, status: "completed" } })}
                        disabled={app.status === "completed"}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t("Mark completed")}
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={() => updateAppointmentMutation.mutate({ appointmentId: app.id, data: { ...app, status: "cancelled" } })}
                        disabled={app.status === "cancelled"}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t("Cancel")}
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
                        title={t("Delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/calendar" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              {t("Open full calendar")} <ChevronRight size={14} />
            </Link>
          </div>

          {/* Quotes history */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <FileText className="text-emerald-600" size={20} /> Quotes ({(quotes || []).length})
            </h3>
            {(!quotes || quotes.length === 0) ? (
              <p className="text-sm text-slate-400">{t("No quotes for this client yet.")}</p>
            ) : (
              <div className="space-y-2">
                {quotes
                  .slice()
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((q) => (
                    <div key={q.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg text-sm">
                      <div>
                        <DocumentHover kind="quote" doc={q} className="font-medium text-slate-700">Quote {q.number || `#${q.id}`} — {money(q.total_amount)}</DocumentHover>
                        <div className="text-xs text-slate-400">{new Date(q.date).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={q.status}
                          onChange={(e) => updateQuoteMutation.mutate({ quoteId: q.id, data: { ...q, status: e.target.value } })}
                          className={`text-xs font-bold rounded-full px-2 py-1 border-0 outline-none ${statusStyle(q.status)}`}
                        >
                          <option value="Draft">{t("Draft")}</option>
                          <option value="Sent">{t("Sent")}</option>
                          <option value="Accepted">{t("Accepted")}</option>
                        </select>
                        <button
                          onClick={() => setPreview(quoteDoc(q, client, () => markQuoteSent(q, queryClient, q.program_id)))}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={t("Preview")}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => downloadDocumentPdf("quote", q.id, q.number)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={t("Download PDF")}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(deleteConfirm(`quote ${q.number || `#${q.id}`}`, "Its lines go with it."))) {
                              deleteQuoteMutation.mutate(q.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          title={t("Delete")} data-admin-only
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <Link to="/programs" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              {t("Full item detail & new quotes")} <ChevronRight size={14} />
            </Link>
          </div>

          {/* Orders history */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <ShoppingCart className="text-emerald-600" size={20} /> Orders ({(orders || []).length})
            </h3>
            {(!orders || orders.length === 0) ? (
              <p className="text-sm text-slate-400">{t("No orders for this client yet.")}</p>
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
                          <option value="Pending">{t("Pending")}</option>
                          <option value="Paid">{t("Paid")}</option>
                          <option value="Shipped">{t("Shipped")}</option>
                        </select>
                        <button
                          onClick={() => {
                            if (window.confirm(deleteConfirm(`order #${o.id}`))) {
                              deleteOrderMutation.mutate(o.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          title={t("Delete")} data-admin-only
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <Link to="/orders" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              {t("Manage all orders")} <ChevronRight size={14} />
            </Link>
          </div>

          {/* Invoices history */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <FileText className="text-emerald-600" size={20} /> Invoices ({(invoices || []).length})
            </h3>
            {(!invoices || invoices.length === 0) ? (
              <p className="text-sm text-slate-400">{t("No invoices for this client yet.")}</p>
            ) : (
              <div className="space-y-2">
                {invoices
                  .slice()
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg text-sm">
                      <div>
                        <DocumentHover kind="invoice" doc={inv} className="font-medium text-slate-700">Invoice {inv.number || `#${inv.id}`} — {money(inv.total_amount)}</DocumentHover>
                        <div className="text-xs text-slate-400">{new Date(inv.date).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={inv.status}
                          onChange={(e) => updateInvoiceMutation.mutate({ invoiceId: inv.id, data: { ...inv, status: e.target.value } })}
                          className={`text-xs font-bold rounded-full px-2 py-1 border-0 outline-none ${statusStyle(inv.status)}`}
                        >
                          <option value="unpaid">{t("Unpaid")}</option>
                          <option value="paid">{t("Paid")}</option>
                          <option value="cancelled">{t("Cancelled")}</option>
                        </select>
                        <button
                          onClick={() => setPreview(invoiceDoc(inv, client))}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={t("Preview")}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => downloadDocumentPdf("invoice", inv.id, inv.number)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={t("Download PDF")}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(deleteConfirm(`invoice ${inv.number || `#${inv.id}`}`, "Its lines, payments and credit notes go with it."))) {
                              deleteInvoiceMutation.mutate(inv.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          title={t("Delete")} data-admin-only
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <Link to="/invoices" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
              {t("Create a new invoice")} <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      <Modal isOpen={isEditClientOpen} onClose={() => setIsEditClientOpen(false)} title={t("Edit Client")}>
        {clientForm && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("Full Name")}</label>
              <input
                type="text"
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("Farm / Business Name")}</label>
              <input
                type="text"
                value={clientForm.farm_name}
                onChange={(e) => setClientForm({ ...clientForm, farm_name: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("Email Address")}</label>
                <input
                  type="email"
                  value={clientForm.email}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("Cell / WhatsApp Number")}</label>
                <input
                  type="tel"
                  value={clientForm.phone}
                  onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("Physical Address")}</label>
                <textarea
                  value={clientForm.address}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  rows="3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("Postal Address")}</label>
                <textarea
                  value={clientForm.postal_address}
                  onChange={(e) => setClientForm({ ...clientForm, postal_address: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  rows="3"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("Customer VAT Number")}</label>
              <input
                value={clientForm.vat_number}
                onChange={(e) => setClientForm({ ...clientForm, vat_number: e.target.value })}
                placeholder={t("Printed on invoices if the client has one")}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
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

      <Modal isOpen={isScheduleModalOpen} onClose={closeScheduleModal} title={`${editingAppointmentId ? "Change visit" : "Schedule visit"} - ${farmLabel(client)}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("Date")}</label>
              <input
                type="date"
                value={newAppointment.date}
                onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("Time")}</label>
              <input
                type="time"
                value={newAppointment.time}
                onChange={(e) => setNewAppointment({ ...newAppointment, time: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          {clientAnimals.length > 0 && <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("Animal (Optional)")}</label>
            <select
              value={newAppointment.animal_id}
              onChange={(e) => setNewAppointment({ ...newAppointment, animal_id: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">{t("Whole herd / general visit")}</option>
              {clientAnimals.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.species})</option>
              ))}
            </select>
          </div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("Reason for Visit")}</label>
            <textarea
              value={newAppointment.reason}
              onChange={(e) => setNewAppointment({ ...newAppointment, reason: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              rows={3}
              placeholder={t("e.g. Monthly vaccination")}
            />
          </div>
          <button
            disabled={!newAppointment.reason || !newAppointment.date || saveAppointmentMutation.isPending}
            onClick={() => saveAppointmentMutation.mutate(newAppointment)}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {saveAppointmentMutation.isPending ? "Saving..." : editingAppointmentId ? "Save changes" : "Schedule Visit"}
          </button>
        </div>
      </Modal>

      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
};

export default ClientDetail;
