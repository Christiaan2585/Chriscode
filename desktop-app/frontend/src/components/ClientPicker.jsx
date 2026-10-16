import { t } from "../utils/i18n";
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import Modal from "./Modal";
import SearchableSelect from "./SearchableSelect";

const field = "w-full rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";

// The client box on the invoice, quote and order forms: search, the last few clients you used first, and
// "+ New client" so a client that doesn't exist yet can be added right here without leaving the form.
const ClientPicker = ({ value, onChange, clients }) => {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState(null); // null = dialog closed; otherwise what was typed in the search box
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", language: "" });
  const create = useMutation({
    mutationFn: async () => (await apiClient.post("/clients/", { ...draft, name: draft.name.trim(), phone: draft.phone.trim() || null, email: draft.email.trim() || null, language: draft.language || null }, { silent: true })).data,
    onSuccess: (client) => {
      queryClient.setQueryData(["clients"], (old) => [...(old || []), client]);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onChange(String(client.id));
      setTyped(null);
    },
  });
  const error = create.error?.response?.data?.detail?.toString?.() || (create.error ? "That didn't save." : "");

  return (
    <>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={(clients || []).map((c) => ({ value: c.id, label: c.name, sublabel: c.farm_name }))}
        placeholder={t("Select a client…")}
        searchPlaceholder="Search clients…"
        recentKey="client"
        createLabel="New client"
        onCreate={(query) => { setDraft({ name: query, phone: "", email: "", language: "" }); create.reset(); setTyped(query); }}
      />
      <Modal isOpen={typed !== null} onClose={() => setTyped(null)} title={t("New client")} size="md">
        <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <label className="block"><span className="text-xs text-slate-500">{t("Name *")}</span>
            <input className={field} required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-xs text-slate-500">{t("Phone")}</span>
              <input className={field} type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-slate-500">{t("Email")}</span>
              <input className={field} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          </div>
          <label className="block"><span className="text-xs text-slate-500">{t("Language for messages")}</span>
            <select className={field} value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
              <option value="">{t("English")}</option><option value="af">Afrikaans</option>
            </select></label>
          <p className="text-xs text-slate-500">{t("You can add the farm, addresses and the rest later on the client's page.")}</p>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <button type="submit" disabled={create.isPending || !draft.name.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {create.isPending ? "Saving..." : "Add client and use it"}
          </button>
        </form>
      </Modal>
    </>
  );
};

export default ClientPicker;
