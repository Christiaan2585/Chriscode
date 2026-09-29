import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Save } from "lucide-react";
import apiClient from "../api/client";

const SECTIONS = [
  ["Business", [
    ["trading_name", "Business name (as printed)", "e.g. NSL de Waal t/a Sandveld Veedienste"],
    ["registration_number", "Company / CK registration number", ""],
    ["vat_number", "VAT number", "Leave blank if not VAT registered"],
    ["phone", "Phone", ""],
    ["email", "Email", ""],
    ["website", "Website", ""],
  ]],
  ["Banking details (printed at the bottom of invoices)", [
    ["bank_name", "Bank", "e.g. Capitec Bank"],
    ["bank_account_holder", "Account holder", ""],
    ["bank_account_number", "Account number", ""],
    ["bank_branch_code", "Branch code", ""],
    ["bank_account_type", "Account type", "e.g. Cheque, Savings"],
    ["payment_note", "Payment note", "e.g. Use the invoice number as reference"],
  ]],
  ["Default sales rep (only for documents made before each user had their own details)", [
    ["sales_rep", "Name", ""],
    ["sales_rep_phone", "Phone", ""],
  ]],
];
const AREA_FIELDS = [
  ["postal_address", "Postal address"],
  ["physical_address", "Physical address"],
];
const NUMBERING = [
  ["invoice", "Invoice", "next_invoice_number"],
  ["quote", "Quote", "next_quote_number"],
  ["po", "PO", "next_po_number"],
];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500";

const Field = ({ label, children, hint, required = false }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">
      {label}
      {required && <span className="text-red-600" aria-label="required"> *</span>}
    </span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);

// Keyed on the saved data so the draft resets whenever a save comes back.
const BusinessForm = ({ saved, canEdit, justSaved, onSaved }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(saved);
  const set = (key) => (e) =>
    setDraft({ ...draft, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = useMutation({
    mutationFn: async () => {
      const numbers = ["vat_rate", "payment_terms_days", "quote_valid_days",
        "invoice_start_number", "quote_start_number", "po_start_number"];
      const payload = { ...draft };
      numbers.forEach((k) => { payload[k] = Number(payload[k]); });
      return (await apiClient.put("/business/", payload)).data;
    },
    onSuccess: (data) => {
      onSaved();
      queryClient.setQueryData(["business"], data);
    },
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const required = new Set(saved.required_fields || []);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {saved.missing?.length > 0 && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Still needed on your invoices: {saved.missing.join(", ")}.
        </p>
      )}
      <p className="text-xs text-slate-500">
        <span className="text-red-600">*</span> Needed on your invoices. Everything else is optional.
      </p>
      <fieldset disabled={!canEdit} className="space-y-6">
        {SECTIONS.map(([title, fields], i) => (
          <React.Fragment key={title}>
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map(([key, label, placeholder]) => (
                  <Field key={key} label={label} required={required.has(key)}>
                    <input className={inputClass} value={draft[key] ?? ""} onChange={set(key)} placeholder={placeholder} />
                  </Field>
                ))}
              </div>
            </section>
            {i === 0 && (
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-800">Addresses</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {AREA_FIELDS.map(([key, label]) => (
                    <Field key={key} label={label} required={required.has(key)}>
                      <textarea rows={4} className={inputClass} value={draft[key] ?? ""} onChange={set(key)} />
                    </Field>
                  ))}
                </div>
              </section>
            )}
          </React.Fragment>
        ))}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-3">
            <input type="checkbox" checked={draft.vat_registered} onChange={set("vat_registered")} className="h-4 w-4 accent-emerald-600" />
            VAT registered (charge VAT and print "Tax Invoice")
          </label>
          <Field label="VAT rate %">
            <input type="number" min="0" max="100" step="0.01" className={inputClass} value={draft.vat_rate} onChange={set("vat_rate")} />
          </Field>
          <Field label="Invoices due after (days)">
            <input type="number" min="0" max="365" className={inputClass} value={draft.payment_terms_days} onChange={set("payment_terms_days")} />
          </Field>
          <Field label="Quotes valid for (days)">
            <input type="number" min="0" max="365" className={inputClass} value={draft.quote_valid_days} onChange={set("quote_valid_days")} />
          </Field>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Document numbers</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {NUMBERING.map(([kind, label, nextKey]) => (
              <div key={kind} className="grid grid-cols-2 gap-2">
                <Field label={`${label} prefix`}>
                  <input className={inputClass} value={draft[`${kind}_prefix`]} onChange={set(`${kind}_prefix`)} />
                </Field>
                <Field label="Start from" hint={`Next: ${saved[nextKey]}`}>
                  <input type="number" min="1" className={inputClass} value={draft[`${kind}_start_number`]} onChange={set(`${kind}_start_number`)} />
                </Field>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Numbers carry on after the highest one already used. To continue from Sage, set "Start from" to one more
            than your last Sage number (e.g. 181 after INV0000180).
          </p>
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex items-center justify-end gap-3">
          {justSaved && !dirty && <span role="status" className="text-sm text-emerald-600">Saved</span>}
          <button
            type="submit"
            disabled={!dirty || save.isPending}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save size={16} /> {save.isPending ? "Saving…" : "Save business details"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Only an admin can change these.</p>
      )}
    </form>
  );
};

const BusinessSettings = ({ canEdit, bare = false }) => {
  const [justSaved, setJustSaved] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await apiClient.get("/business/")).data,
  });

  const body = isLoading ? (
    <p className="text-sm text-slate-400">Loading…</p>
  ) : isError ? (
    <p className="text-sm text-red-600">Couldn't load the business details.</p>
  ) : (
    <BusinessForm
      key={JSON.stringify(data)}
      saved={data}
      canEdit={Boolean(canEdit)}
      justSaved={justSaved}
      onSaved={() => setJustSaved(true)}
    />
  );
  if (bare) return body;

  return (
    <div id="business-details" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        <Landmark size={18} /> Business Details
      </h3>
      <p className="text-sm text-slate-500">Printed on invoices, quotes and purchase orders.</p>
      {body}
    </div>
  );
};

export default BusinessSettings;
