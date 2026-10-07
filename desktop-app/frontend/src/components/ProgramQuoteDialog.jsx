import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import SearchableSelect from "./SearchableSelect";
import { money, statusStyle } from "../utils/format";
import { dayLabel } from "../utils/herding";

// Quotes page -> "From herding program": pick the client, their program and
// the steps; the quote is made by the program (POST /programs/{id}/quote),
// so it stays linked to it and prints step by step.
const ProgramQuoteDialog = ({ isOpen, onClose, clients = [], onOpenQuote }) => {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [programId, setProgramId] = useState("");
  const [unticked, setUnticked] = useState(() => new Set()); // step ids left out; everything else is in
  const [result, setResult] = useState(null);

  const { data: programs = [] } = useQuery({
    queryKey: ["programs", "client", String(clientId)],
    queryFn: async () => (await apiClient.get(`/programs/client/${clientId}`)).data,
    enabled: Boolean(clientId),
  });
  const dated = programs.filter((p) => p.mating_date);
  const { data: schedule } = useQuery({
    queryKey: ["program-schedule", Number(programId)],
    queryFn: async () => (await apiClient.get(`/programs/${programId}/schedule`)).data,
    enabled: Boolean(programId),
  });
  const steps = (schedule?.steps || []).filter((s) => s.products.some((l) => l.buy > 0));
  const picked = steps.filter((s) => !unticked.has(s.id));

  const make = useMutation({
    mutationFn: async () => (await apiClient.post(`/programs/${programId}/quote`, {
      line_ids: picked.flatMap((s) => s.products.filter((l) => l.buy > 0).map((l) => l.id)),
    })).data,
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["program-schedule", Number(programId)] });
    },
  });

  const close = () => {
    setClientId("");
    setProgramId("");
    setUnticked(new Set());
    setResult(null);
    make.reset();
    onClose();
  };
  const toggle = (stepId, on) => {
    const next = new Set(unticked);
    if (on) next.delete(stepId);
    else next.add(stepId);
    setUnticked(next);
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Quote from a herding program" size="lg">
      {result ? (
        <div className="space-y-4">
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 size={18} aria-hidden="true" /> Quote <b>{result.quote.number}</b> made - {money(result.quote.total_amount)}.
          </p>
          {result.skipped.length > 0 && (
            <ul className="list-disc pl-6 text-sm text-amber-700">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Close</button>
            <button type="button" onClick={() => { const { quote } = result; close(); onOpenQuote(quote); }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Open the quote</button>
          </div>
        </div>
      ) : (
        <div className="min-h-[22rem] space-y-4">{/* room for the client list to open */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Client</span>
              <SearchableSelect value={clientId} placeholder="Choose a client…" searchPlaceholder="Search clients…"
                options={clients.map((c) => ({ value: c.id, label: c.name, sublabel: c.farm_name }))}
                onChange={(v) => { setClientId(v); setProgramId(""); setUnticked(new Set()); }} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Herding program</span>
              <select value={programId} disabled={!clientId} onChange={(e) => { setProgramId(e.target.value); setUnticked(new Set()); }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
                <option value="">{clientId && !dated.length ? "No program with a mating date" : "Choose…"}</option>
                {dated.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>

          {programId && schedule && (
            steps.length === 0 ? (
              <p className="text-sm text-slate-500">This program has no products to quote - add products and animal numbers on the client's page.</p>
            ) : (
              <fieldset className="space-y-1">
                <legend className="mb-1 text-sm font-medium text-slate-700">Steps to quote</legend>
                <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {steps.map((s) => (
                    <li key={s.id}>
                      <label className="flex items-center gap-3 px-3 py-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!unticked.has(s.id)}
                          onChange={(e) => toggle(s.id, e.target.checked)} />
                        <span className="w-28 shrink-0 font-medium text-slate-800">{s.date ? dayLabel(s.date) : "Any time"}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-600">{s.stage || `${s.products.length} products`}</span>
                        {s.quotes.map((q) => (
                          <span key={q.id} className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(q.status)}`}>{q.number}</span>
                        ))}
                        <span className="tabular-nums text-slate-700">{money(s.subtotal_buy)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500">
                  Amounts are whole packs excluding VAT; the quote adds VAT where it applies. A step already on another quote shows its number.
                </p>
              </fieldset>
            )
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="button" disabled={!picked.length || make.isPending} onClick={() => make.mutate()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {make.isPending ? "Making quote…" : `Quote ${picked.length} step${picked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ProgramQuoteDialog;
