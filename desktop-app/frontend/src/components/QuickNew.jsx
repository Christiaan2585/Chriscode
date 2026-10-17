import { t } from "../utils/i18n";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronDown, FilePlus2, FileText, Plus, UserPlus, Wallet } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import MarkPaidDialog from "./MarkPaidDialog";
import SearchableSelect from "./SearchableSelect";
import { money } from "../utils/format";

// "Record a payment" from anywhere: pick one of the unpaid invoices, then the usual Mark as paid dialog opens.
const PayPicker = ({ onClose }) => {
  const [picked, setPicked] = useState("");
  const [paying, setPaying] = useState(null);
  const { data: invoices } = useQuery({ queryKey: ["invoices"], queryFn: async () => (await apiClient.get("/invoices/")).data });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: async () => (await apiClient.get("/clients/")).data });
  const { data: balances } = useQuery({ queryKey: ["invoice-balances"], queryFn: async () => (await apiClient.get("/payments/balances")).data });
  const owing = (invoices || []).filter((i) => i.status === "unpaid" && balances?.[i.id]?.balance > 0);
  const nameOf = (id) => { const c = (clients || []).find((x) => x.id === id); return c ? (c.farm_name || c.name) : ""; };
  const options = owing.map((i) => ({ value: String(i.id), label: `${i.number || `#${i.id}`} · ${nameOf(i.client_id)}`, sublabel: money(balances[i.id].balance) }));

  if (paying) return <MarkPaidDialog invoice={paying.invoice} balance={paying.balance} onClose={() => { setPaying(null); onClose(); }} />;
  return (
    <Modal isOpen onClose={onClose} title={t("Record a payment")} size="md">
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">{t("Which invoice was paid?")}</p>
        <SearchableSelect value={picked} onChange={setPicked} options={options} placeholder={t("Choose an unpaid invoice")} searchPlaceholder={t("Search by number or client")} />
        {invoices && options.length === 0 && <p className="text-slate-500">{t("Nothing is owing right now.")}</p>}
        <button type="button" disabled={!picked}
          onClick={() => { const invoice = owing.find((i) => String(i.id) === picked); setPaying({ invoice, balance: balances[invoice.id].balance }); }}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{t("Next")}</button>
      </div>
    </Modal>
  );
};

const ITEMS = [
  { label: "Client", to: "/clients?new=1", Icon: UserPlus },
  { label: "Quote", to: "/programs?new=1", Icon: FileText },
  { label: "Invoice", to: "/invoices?new=1", Icon: FilePlus2 },
  { label: "Payment", pay: true, Icon: Wallet },
  { label: "Visit", to: "/calendar", Icon: CalendarPlus },
];

// The "+ New" button in the header: make a client, quote, invoice, payment or visit from whatever screen you are on.
const QuickNew = () => {
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const root = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const escape = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const choose = (item) => {
    setOpen(false);
    if (item.pay) setPaying(true); else navigate(item.to);
  };
  return (
    <div ref={root} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
        <Plus size={16} aria-hidden="true" /> <span className="hidden sm:inline">{t("New")}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {ITEMS.map((item) => (
            <li key={item.label} role="none">
              <button type="button" role="menuitem" onClick={() => choose(item)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
                <item.Icon size={16} aria-hidden="true" /> {t(item.label)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {paying && <PayPicker onClose={() => setPaying(false)} />}
    </div>
  );
};

export default QuickNew;
