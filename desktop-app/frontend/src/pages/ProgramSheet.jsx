import React, { Fragment, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CalendarDays, CheckCircle2, Copy, FileDown, FileSpreadsheet, FileText, Pencil, Plus, Receipt, RotateCcw,
  Trash2, Upload, X,
} from "lucide-react";
import apiClient from "../api/client";
import { clientService } from "../api/services";
import { useAuth } from "../context/AuthContext";
import { isOffline, queueRequest } from "../utils/outbox";
import Modal from "../components/Modal";
import DocumentPreview from "../components/DocumentPreview";
import InlineEdit from "../components/InlineEdit";
import NameColorPicker from "../components/NameColorPicker";
import ProgramLineForm from "../components/ProgramLineForm";
import {
  HeadCountFields, ProgramForm, StatusChip, StepDate, countsFrom, countsPayload, fileName, formFrom, linkButton,
  primary, programPayload, ruleLabel, secondary, useProducts, useSchedule,
} from "../components/HerdingProgramPanel";
import { saveBlob } from "../utils/documents";
import { money, statusStyle } from "../utils/format";
import { nameColorClass } from "../utils/nameColors";
import { copyProgram } from "../utils/programClipboard";
import { GROUPS, SECTIONS, TEXT_COLUMNS, amount, dayLabel } from "../utils/herding";

const COLUMNS = ["DATUM", "TYD", "PRODUK", "VERPAK", "PRYS EXCL VAT", "DOSERING ml / Dier", "PRODUK TOTAAL", "TOTAAL R"];
const SPAN = COLUMNS.length + 1; // + the actions column
const num = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";
const CLIENT_ROWS = [["Business", "farm_name"], ["Name", "name"], ["Address", "address"], ["Email", "email"],
  ["Cell", "phone"], ["VAT no", "vat_number"]];

// The Kudde program's notes for a date ("Laat toets ramme"), small and folded
// away under the sheet's row so the page still reads like the cost sheet.
const Notes = ({ steps }) => {
  const parts = steps.flatMap((s) => TEXT_COLUMNS.filter(([key]) => s[key]).map(([key, label]) => ({ key: `${s.id}-${key}`, label, text: s[key], stage: s !== steps[0] && s.stage })));
  if (!parts.length) return null;
  return (
    <details className="text-xs text-slate-600">
      <summary className="cursor-pointer truncate text-slate-500 hover:text-emerald-700">
        Notes: {parts[0].text.split("\n")[0]}{parts.length > 1 || parts[0].text.includes("\n") ? " …" : ""}
      </summary>
      <div className="mt-1 grid grid-cols-1 gap-2 pb-1 sm:grid-cols-2 lg:grid-cols-3">
        {parts.map((p) => (
          <div key={p.key}>
            <div className="font-semibold uppercase tracking-wide text-slate-500">{p.stage ? `${p.stage} - ` : ""}{p.label}</div>
            <p className="whitespace-pre-line">{p.text}</p>
          </div>
        ))}
      </div>
    </details>
  );
};

// A client's herding program laid out like the business's cost sheet: the
// animals, client and DEKTYD at the top, then the sheet's sections, each
// with its dates, products and TOTAAL, and TOTALE KOSTE + per animal at the foot.
const ProgramSheet = () => {
  const { programId: idParam } = useParams();
  const programId = Number(idParam);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useSchedule(programId);
  const { data: products = [] } = useProducts();
  const clientId = data?.program?.client_id;
  const { data: client } = useQuery({
    queryKey: ["client", String(clientId)],
    queryFn: () => clientService.getById(clientId),
    enabled: Boolean(clientId),
  });
  const [editing, setEditing] = useState(false);
  const [counts, setCounts] = useState(null);
  const [lineForm, setLineForm] = useState(null); // {stepId} to add, {lineId} to change
  const [newStep, setNewStep] = useState(null);
  const [result, setResult] = useState(null); // last import / invoice result
  const [preview, setPreview] = useState(null);
  const [copiedNote, setCopiedNote] = useState(false);
  const fileInput = useRef(null);

  const base = `/programs/${programId}`;
  // The program and its quote are one thing: every change refreshes both.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["program-schedule", programId] });
    queryClient.invalidateQueries({ queryKey: ["programs", "client", String(clientId)] });
    queryClient.invalidateQueries({ queryKey: ["program-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["quotes"] });
    queryClient.invalidateQueries({ queryKey: ["document-pdf", "quote"] });
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
  const patchStep = (stepId, changes) => run(apiClient.patch(`${base}/steps/${stepId}`, changes));
  const patchProgram = (changes) => run(apiClient.patch(base, changes));

  const toggleDone = useMutation({
    mutationFn: ({ stepIds, done }) =>
      Promise.all(stepIds.map((id) => apiClient.put(`${base}/steps/${id}/done`, { done }, { queueable: true }))),
    onError: (error, { stepIds, done }) => {
      if (!isOffline(error)) return;
      // Off the office Wi-Fi: queue the ticks for later and show them now
      // rather than losing them (see utils/outbox.js).
      stepIds.forEach((id) => queueRequest("put", `${base}/steps/${id}/done`, { done }));
      if (done) {
        queryClient.setQueryData(["program-schedule", programId], (old) =>
          old && { ...old, steps: old.steps.map((s) => (stepIds.includes(s.id) ? { ...s, status: "done" } : s)) });
      }
    },
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
    onSuccess: refresh,
  });
  const setStatus = useMutation({
    mutationFn: (status) => apiClient.put(`${base}/quote/status`, { status }),
    onSettled: refresh,
  });
  const makeInvoice = useMutation({
    mutationFn: async (stepId) => (await apiClient.post(`${base}/steps/${stepId}/invoice`)).data,
    onSuccess: (invoice) => {
      setResult({ kind: "invoiced", invoice });
      refresh();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
  const downloadSheet = useMutation({
    mutationFn: async () => (await apiClient.get(`${base}/sheet.xlsx`, { responseType: "blob" })).data,
    onSuccess: (blob) => saveBlob(blob, fileName(`Kostes - ${client?.name || ""} - ${data.program.name}.xlsx`)),
  });
  const importSheet = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file);
      return (await apiClient.post(`${base}/sheet`, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: (r) => { setResult({ ...r, kind: "imported" }); refresh(); },
  });

  const saveLine = async (payload) => {
    const request = lineForm.lineId
      ? apiClient.patch(`${base}/lines/${lineForm.lineId}`, payload)
      : apiClient.post(`${base}/steps/${lineForm.stepId}/products`, payload);
    if (await run(request)) setLineForm(null);
  };
  const removeLine = (line) => {
    if (!window.confirm(`Remove ${line.product_name} from this client's program and its quote?`)) return;
    run(apiClient.delete(`${base}/lines/${line.id}`));
  };
  const removeStep = (step) => {
    if (!window.confirm(`Remove "${step.stage || ruleLabel(step)}" and its products from this client's program and its quote?`)) return;
    run(apiClient.delete(`${base}/steps/${step.id}`));
  };
  const addStep = async (e) => {
    e.preventDefault();
    const ok = await run(apiClient.post(`${base}/steps`, {
      anchor: "mating_start", offset_days: 0, stage: newStep.stage.trim() || null, date_override: newStep.date,
      section: newStep.section,
    }));
    if (ok) setNewStep(null);
  };

  if (isLoading || !data) return <div className="p-8 text-center">Loading the program…</div>;
  const { program, groups, steps, sections, anchors, totals, progress, quote } = data;
  const locked = Boolean(quote?.locked); // accepted: the agreed products and amounts can't change
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  // Kudde program steps (no products, no section) show as notes under the
  // sheet's row on the same date; the rest are listed at the end.
  const noteSteps = steps.filter((s) => !s.section && !s.products.length);
  const sheetDates = new Set(steps.filter((s) => s.section && s.date).map((s) => s.date));
  const notesFor = (step) => [step, ...(step.date ? noteSteps.filter((n) => n.date === step.date && n.id !== step.id) : [])];
  const scanStep = steps.find((s) => s.origin === "scan"); // 77 days after the rams go in
  const otherDates = noteSteps.filter((n) => !n.date || !sheetDates.has(n.date));
  const count = (name) => groups.find((g) => g.animal_type.trim().toLowerCase() === name.toLowerCase())?.group_size ?? 0;
  const title = `${client?.name || ""} - ${program.name}`;

  const stepRows = (step) => {
    const notes = notesFor(step);
    const doneIds = notes.filter((n) => n.status !== "none").map((n) => n.id);
    const agreed = step.products.some((l) => l.buy > 0);
    return (
      <Fragment key={step.id}>
        <tr className="border-t border-slate-200 bg-slate-50 align-top">
          <td className="w-36 px-2 py-1.5">
            <StepDate key={`${step.date}`} step={step} onSave={(changes) => patchStep(step.id, changes)} />
          </td>
          <td colSpan={COLUMNS.length - 2} className="px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-semibold text-slate-800 ${nameColorClass(step.color)}`}>
                <InlineEdit label="Step name" value={step.stage} placeholder={ruleLabel(step)}
                  onSave={(v) => patchStep(step.id, { stage: v })} />
              </span>
              <NameColorPicker label="this step's name" value={step.color} onChange={(color) => patchStep(step.id, { color })} />
              {step.status !== "none" && <StatusChip status={step.status} />}
              {step.invoice ? (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(step.invoice.status)}`}>
                  Invoice {step.invoice.number} · {step.invoice.status}
                </span>
              ) : locked && agreed && (
                <button type="button" disabled={makeInvoice.isPending} onClick={() => {
                  if (window.confirm(`Make the invoice for "${step.stage || ruleLabel(step)}" from the accepted quote?`)) makeInvoice.mutate(step.id);
                }} className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-emerald-700">
                  <FileText size={12} /> Make invoice
                </button>
              )}
            </div>
            <Notes steps={notes} />
          </td>
          <td className="px-2 py-1.5 text-right">
            {doneIds.length > 0 && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={step.status === "done"}
                  disabled={toggleDone.isPending}
                  onChange={(e) => toggleDone.mutate({ stepIds: doneIds, done: e.target.checked })} />
                Done
              </label>
            )}
          </td>
          <td className="px-2 py-1.5 text-right">
            {!(locked && step.products.length) && (
              <button type="button" onClick={() => removeStep(step)} aria-label="Remove this date" title="Remove this date"
                className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
            )}
          </td>
        </tr>
        {step.products.map((line) => (lineForm?.lineId === line.id ? (
          <tr key={line.id}><td colSpan={SPAN} className="px-2 py-2">
            <ProgramLineForm line={line} products={products} onSubmit={saveLine} onCancel={() => setLineForm(null)} />
          </td></tr>
        ) : (
          <tr key={line.id} className="align-top">
            <td />
            <td className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{line.category}</td>
            <td className="px-2 py-1.5">
              <span className="font-medium text-slate-800">{line.product_name}</span>
              {line.note && <span className="block text-xs text-slate-500">{line.note}</span>}
            </td>
            <td className={num}>{line.pack_size ? `${amount(line.pack_size)} ${line.unit || ""}` : ""}</td>
            <td className={num} title={line.unit_price != null ? "Agreed price" : "The product's price"}>
              {money(line.price_excl_vat)}{line.unit_price != null && <span className="block text-[11px] text-emerald-700">agreed</span>}
            </td>
            <td className={num}>
              {line.fixed_quantity ? `x ${amount(line.fixed_quantity)}` : line.dose ? `${amount(line.dose)} ${line.unit || ""}` : "—"}
              {!line.fixed_quantity && (
                <span className="block whitespace-normal text-[11px] text-slate-400">{line.animal_group || "All animals"} ({amount(line.head)})</span>
              )}
            </td>
            <td className={num} title="Packs used (whole packs on the quote)">
              {line.used.toFixed(2)}{line.buy !== line.used && <span className="text-slate-400"> ({amount(line.buy)})</span>}
              {line.quantity_override != null && <span className="block text-[11px] text-emerald-700">agreed</span>}
            </td>
            <td className={`${num} font-medium text-slate-800`}>
              {money(line.cost_used)}
              {line.discount_percent ? <span className="block text-[11px] font-normal text-emerald-700">less {amount(line.discount_percent)}%</span> : null}
            </td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right">
              {!locked && (
                <>
                  <button type="button" onClick={() => setLineForm({ lineId: line.id })} aria-label={`Change ${line.product_name}`}
                    title="Change" className="p-1 text-slate-400 hover:text-emerald-700"><Pencil size={14} /></button>
                  <button type="button" onClick={() => removeLine(line)} aria-label={`Remove ${line.product_name}`}
                    title="Remove" className="p-1 text-slate-400 hover:text-red-600"><X size={14} /></button>
                </>
              )}
            </td>
          </tr>
        )))}
        <tr>
          <td colSpan={SPAN} className="px-2 pb-2">
            {lineForm?.stepId === step.id ? (
              <ProgramLineForm products={products} submitLabel="Add" onSubmit={saveLine} onCancel={() => setLineForm(null)} />
            ) : (
              <div className="flex items-center justify-between">
                {locked ? <span /> : (
                  <button type="button" onClick={() => setLineForm({ stepId: step.id })} className={`${linkButton} flex items-center gap-1`}>
                    <Plus size={13} /> Add a product
                  </button>
                )}
                {step.products.length > 1 && (
                  <span className="text-sm text-slate-600">Subtotal <b className="tabular-nums text-slate-800">{money(step.subtotal)}</b></span>
                )}
              </div>
            )}
          </td>
        </tr>
      </Fragment>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {clientId && (
            <Link to={`/clients/${clientId}`} aria-label="Back to the client" className="mt-1 text-slate-500 hover:text-emerald-700">
              <ArrowLeft size={22} />
            </Link>
          )}
          <div>
            <h2 className={`flex flex-wrap items-center gap-2 text-3xl font-bold text-slate-800 ${nameColorClass(program.color)}`}>
              <InlineEdit label="Program name" required value={program.name} inputClassName="text-2xl font-bold"
                onSave={(v) => patchProgram({ name: v })} />
              <NameColorPicker label="the program name" value={program.color} onChange={(color) => patchProgram({ color })} />
            </h2>
            <p className="text-slate-500">Herding program costs for {client?.name || "…"}{program.goal ? ` · ${program.goal}` : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {anchors && (
            <>
              <button type="button" className={secondary} title="Copy this program, then paste it into another client's page"
                onClick={() => { copyProgram(program, client ? (client.farm_name || client.name) : ""); setCopiedNote(true); }}>
                <Copy size={16} /> {copiedNote ? "Copied - open a client and Paste" : "Copy program"}
              </button>
              <button type="button" className={secondary} onClick={() => setPreview({
                kind: "program-costs", id: programId, title: `${program.name} - costs`, url: `${base}/costs.pdf`,
                filename: fileName(`Program costs - ${title}.pdf`), hint: "The costs laid out like the cost sheet, amounts excluding VAT.",
              })}><Receipt size={16} /> Costs PDF</button>
              <button type="button" className={secondary} onClick={() => setPreview({
                kind: "program", id: programId, title: program.name, url: `${base}/pdf`,
                filename: fileName(`Herding program - ${title}.pdf`), hint: "The program's steps and notes for the farmer.",
              })}><FileDown size={16} /> Program PDF</button>
              <button type="button" className={secondary} disabled={downloadSheet.isPending} onClick={() => downloadSheet.mutate()}>
                <FileSpreadsheet size={16} /> {downloadSheet.isPending ? "Making…" : "Excel"}
              </button>
            </>
          )}
          <button type="button" className={secondary} disabled={importSheet.isPending || locked} onClick={() => fileInput.current?.click()}
            title={locked ? "The quote is accepted - set it back to Draft to import" : undefined}>
            <Upload size={16} /> {importSheet.isPending ? "Importing…" : "Import Excel"}
          </button>
          <input ref={fileInput} type="file" accept=".xlsx" className="sr-only" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file && window.confirm("Bring this cost sheet into the program? Its DEKTYD, animal numbers and products replace the program's; steps already ticked off stay ticked.")) importSheet.mutate(file);
          }} />
        </div>
      </div>

      {result && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <p className="flex flex-wrap items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            {result.kind === "imported"
              ? <>Cost sheet imported: {result.lines} product lines - the quote follows.</>
              : <>Invoice <b>{result.invoice.number}</b> made. <Link to="/invoices" className="font-semibold underline">Open Invoices</Link></>}
          </p>
          {(result.skipped || []).length > 0 && (
            <ul className="mt-1 list-disc pl-6 text-amber-700">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul>
          )}
          {(result.unmatched || []).length > 0 && (
            <p className="mt-1 text-amber-700">Not in the product list, so left out: {result.unmatched.join(", ")}.</p>
          )}
        </div>
      )}

      {quote && (
        <section className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4 shadow-sm ${locked ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">This program's quote</div>
            <div className="text-lg font-bold text-slate-800">{quote.number || `#${quote.id}`}</div>
          </div>
          <label className="text-sm text-slate-600">
            <span className="sr-only">Quote status</span>
            <select value={quote.status} disabled={setStatus.isPending} onChange={(e) => {
              const status = e.target.value;
              if (status === "Accepted" && !window.confirm("Mark the quote accepted? The program's products and amounts are then locked, and each date can be invoiced.")) return;
              setStatus.mutate(status);
            }} className={`rounded-full px-3 py-1 text-sm font-medium ${statusStyle(quote.status)}`}>
              {["Draft", "Sent", "Accepted"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="text-sm text-slate-600">
            <span className="text-lg font-bold tabular-nums text-slate-900">{money(quote.grand_total)}</span> incl VAT
            <span className="ml-2 text-xs text-slate-500">({money(quote.total_exclusive)} excl)</span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={secondary} onClick={() => setPreview({ kind: "quote", id: quote.id, title: quote.number })}>
              <FileText size={16} /> Quote PDF
            </button>
          </div>
          <p className="basis-full text-xs text-slate-500">
            {locked
              ? "Accepted - the agreed products and amounts are locked. Make each date's invoice from its row below. Set the quote back to Draft to change anything."
              : "The quote is this program: change a dose, an animal number, a price or a product here or on the quote and both change together."}
          </p>
        </section>
      )}

      {/* The sheet's head: animals, client, dates */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Animals</h3>
            {!counts && !locked && <button type="button" className={linkButton} onClick={() => setCounts(countsFrom(groups))}>Change numbers</button>}
          </div>
          {counts ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveCounts.mutate(); }}>
              <HeadCountFields counts={counts} onChange={setCounts} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCounts(null)} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" disabled={saveCounts.isPending} className={primary}>Save numbers</button>
              </div>
            </form>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {GROUPS.map((g) => (
                  <tr key={g}><td className="py-0.5 text-slate-600">{g}</td><td className="py-0.5 text-right tabular-nums font-medium">{amount(count(g))}</td></tr>
                ))}
                <tr className="border-t border-slate-300 font-bold"><td className="pt-1">Total animals</td><td className="pt-1 text-right tabular-nums">{amount(totals.animals)}</td></tr>
              </tbody>
            </table>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold text-slate-800">Client</h3>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-0.5 text-sm">
            {CLIENT_ROWS.map(([label, field]) => (
              <Fragment key={field}><dt className="text-slate-500">{label}</dt><dd className="text-slate-800">{client?.[field] || "—"}</dd></Fragment>
            ))}
          </dl>
          {user && <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">Sales rep: {[user.name, user.phone, user.email].filter(Boolean).join(" · ")}</p>}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Dates</h3>
            <button type="button" className={`${linkButton} flex items-center gap-1`} onClick={() => setEditing(true)}><CalendarDays size={13} /> Change</button>
          </div>
          {anchors ? (
            <dl className="grid grid-cols-[9rem_1fr] gap-y-0.5 text-sm">
              {[["DEKTYD (first mating)", anchors.mating_start], ["Mating ends", anchors.mating_end],
                ...(scanStep?.date ? [["Scan date", scanStep.date]] : []),
                ["LAMTYD (lambing)", anchors.lambing_start], ["Weaning", anchors.weaning]].map(([label, day]) => (
                <Fragment key={label}><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-slate-800">{dayLabel(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</dd></Fragment>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-amber-700">Set DEKTYD (the first mating day) - every date is worked out from it.</p>
          )}
          {progress.total > 0 && <p className="mt-2 text-xs text-slate-500">{progress.done} of {progress.total} dates done</p>}
        </section>
      </div>


      {anchors && (
        <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">{/* relative: keeps sr-only labels inside the scroll box */}
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="bg-emerald-600 text-left text-xs font-bold uppercase tracking-wide text-white">
                {COLUMNS.map((c, i) => <th key={c} className={`px-2 py-2 ${i >= 4 ? "text-right" : ""}`}>{c}</th>)}
                <th className="w-16 px-2 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            {sections.map((section) => (
              <tbody key={section.name}>
                <tr><td colSpan={SPAN} className="bg-emerald-50 px-2 py-2 text-sm font-bold uppercase tracking-wide text-emerald-800">{section.name}</td></tr>
                {section.step_ids.map((id) => stepRows(byId[id]))}
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={SPAN - 2} className="px-2 py-2 text-right text-xs font-bold uppercase tracking-wide text-slate-600">Totaal {section.name}</td>
                  <td className={`${num} font-bold text-slate-900`}>{money(section.subtotal)}</td>
                  <td />
                </tr>
              </tbody>
            ))}
            {otherDates.length > 0 && (
              <tbody>
                <tr><td colSpan={SPAN} className="bg-slate-50 px-2 py-2 text-sm font-bold uppercase tracking-wide text-slate-600">Other program dates</td></tr>
                {otherDates.map((step) => stepRows(step))}
              </tbody>
            )}
            <tfoot>
              <tr className="border-t-2 border-slate-800">
                <td colSpan={SPAN - 2} className="px-2 py-2 text-right font-bold uppercase text-slate-800">Totale koste</td>
                <td className={`${num} text-base font-bold text-slate-900`}>{money(totals.cost_used)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={SPAN - 2} className="px-2 py-1 text-right text-xs text-slate-500">Buying whole packs</td>
                <td className={`${num} text-slate-600`}>{money(totals.cost_buy)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={SPAN - 2} className="px-2 py-2 text-right font-bold uppercase text-slate-800">Koste per dier per jaar</td>
                <td className={`${num} font-bold text-slate-900`}>{money(totals.per_animal)}</td>
                <td />
              </tr>
              <tr><td colSpan={SPAN} className="px-2 pb-2 text-right text-xs text-slate-500">Prices exclude VAT.</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {anchors && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {newStep ? (
            <form onSubmit={addStep} className="flex flex-wrap items-center gap-2">
              <select aria-label="Section" value={newStep.section} onChange={(e) => setNewStep({ ...newStep, section: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input required type="date" aria-label="Date" value={newStep.date}
                onChange={(e) => setNewStep({ ...newStep, date: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <input aria-label="What happens" placeholder="What happens, e.g. Bloutong enting" value={newStep.stage}
                onChange={(e) => setNewStep({ ...newStep, stage: e.target.value })} className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
              <button type="submit" className={primary}>Add date</button>
              <button type="button" onClick={() => setNewStep(null)} className="px-2 py-1 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </form>
          ) : (
            <button type="button" onClick={() => setNewStep({ date: "", stage: "", section: SECTIONS[0] })} className={secondary}><Plus size={16} /> Add a date</button>
          )}
          {!locked && <button type="button" disabled={reset.isPending} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-700"
            onClick={() => {
              if (window.confirm("Start this client's program again from the master program? Changed products, doses and dates go back to the master's; dates already ticked off stay ticked.")) reset.mutate();
            }}>
            <RotateCcw size={14} /> Start again from the master program
          </button>}
        </div>
      )}


      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Program dates" size="lg">
        {editing && (
          <ProgramForm initial={formFrom(program)} settings={data.template}
            submitting={saveDetails.isPending} onSubmit={(form) => saveDetails.mutate(form)} onCancel={() => setEditing(false)} />
        )}
      </Modal>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
};

export default ProgramSheet;
