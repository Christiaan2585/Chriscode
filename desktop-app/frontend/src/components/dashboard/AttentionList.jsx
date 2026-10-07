import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, FileText, ScanLine, Stethoscope, UserRound } from "lucide-react";
import { dayLabel } from "../../utils/herding";

export const FILTERS = [
  ["all", "Everything", () => true],
  ["treatments", "Treatments", (i) => i.type === "treatment" || i.type === "scan"],
  ["money", "Money", (i) => i.type === "invoice_overdue" || i.type === "ready_to_invoice"],
  ["quotes", "Quotes", (i) => i.type === "quote_followup"],
  ["clients", "Client details", (i) => i.type === "client_info"],
];

const ICONS = { treatment: Stethoscope, scan: ScanLine, invoice_overdue: AlertTriangle, ready_to_invoice: FileText, quote_followup: Bell, client_info: UserRound };
const SEVERITY = {
  overdue: "bg-red-100 text-red-700",
  soon: "bg-amber-100 text-amber-700",
  info: "bg-slate-100 text-slate-600",
};
const SEVERITY_LABEL = { overdue: "Overdue", soon: "Soon", info: "" };
const SHOWN = 8;

// "3 days ago", "today", "in 5 days"
const relative = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const days = Math.round((new Date(y, m - 1, d) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
  if (days === 0) return "today";
  return days < 0 ? `${-days} ${days === -1 ? "day" : "days"} ago` : `in ${days} ${days === 1 ? "day" : "days"}`;
};

const Row = ({ item, hideDetail = false }) => {
  const Icon = ICONS[item.type] || Bell;
  return (
    <li>
      <Link to={item.link} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-slate-50">
        <Icon size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
        <span className="w-32 shrink-0 text-slate-600">
          {item.date ? <><span className="font-medium text-slate-700">{dayLabel(item.date, { day: "numeric", month: "short" })}</span> <span className="text-xs text-slate-400">{relative(item.date)}</span></> : ""}
        </span>
        {SEVERITY_LABEL[item.severity] && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY[item.severity]}`}>{SEVERITY_LABEL[item.severity]}</span>
        )}
        {item.type === "scan" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Scan</span>}
        <span className="min-w-0 flex-1">
          <span className="font-medium text-slate-800">{item.title}</span>
          {item.detail && !hideDetail && <span className="block truncate text-xs text-slate-500">{item.detail}</span>}
        </span>
      </Link>
    </li>
  );
};

// "Needs attention": everything that wants doing, worst first, with chips to narrow it down.
// Treatments are grouped by farm; everything else is one list.
const AttentionList = ({ items, older, filter, onFilter }) => {
  const [all, setAll] = useState(false);
  const predicate = FILTERS.find(([key]) => key === filter)?.[2] || FILTERS[0][2];
  const shown = items.filter(predicate);
  const visible = all ? shown : shown.slice(0, SHOWN);
  const grouped = filter === "treatments";
  const groups = grouped ? [...new Set(visible.map((i) => i.client_name))].map((name) => [name, visible.filter((i) => i.client_name === name)]) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter what needs attention">
        {FILTERS.map(([key, label, test]) => {
          const n = items.filter(test).length;
          return (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => { onFilter(key); setAll(false); }}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                filter === key ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"}`}>
              {label} <span className={filter === key ? "text-white/80" : "text-slate-400"}>{n}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">Nothing here - you're on top of it.</p>
      ) : grouped ? (
        <div className="space-y-2">
          {groups.map(([name, rows]) => (
            <div key={name}>
              <h4 className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{name || "No client"}</h4>
              <ul>{rows.map((i) => <Row key={`${i.type}-${i.id}-${i.step_id ?? ""}`} item={i} hideDetail />)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">{visible.map((i) => <Row key={`${i.type}-${i.id}-${i.step_id ?? ""}`} item={i} />)}</ul>
      )}

      {shown.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-sm font-medium text-emerald-700 hover:underline">
          {all ? "Show fewer" : `Show all ${shown.length}`}
        </button>
      )}
      {older?.steps > 0 && (filter === "all" || filter === "treatments") && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {older.steps} older overdue {older.steps === 1 ? "step" : "steps"} across {older.clients} {older.clients === 1 ? "client" : "clients"} aren't
          listed (more than two weeks ago). Open the client's program and set its first mating day to bring them up to date.
        </p>
      )}
    </div>
  );
};

export default AttentionList;
