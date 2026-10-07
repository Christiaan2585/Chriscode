import React from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Crown, Package } from "lucide-react";
import { money } from "../../utils/format";

export const Panel = ({ icon, title, children, className = "" }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">{icon} {title}</h3>
    {children}
  </div>
);

const Bar = ({ label, value, of, color }) => (
  <div>
    <div className="flex justify-between text-sm"><span className="text-slate-600">{label}</span><span className="font-medium text-slate-800">{money(value)}</span></div>
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${label}: ${of ? Math.round((value / of) * 100) : 0}% of what was agreed`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${of ? Math.min(100, (value / of) * 100) : 0}%` }} />
    </div>
  </div>
);

// What was agreed on accepted herding programs, how much of it is invoiced, how much of that is paid.
export const ProgramMoney = ({ data }) => (
  <Panel icon={<ClipboardList size={18} className="text-emerald-600" />} title="Herding programs">
    {!data || data.quoted === 0 ? (
      <p className="text-sm text-slate-400">No accepted program quotes yet. Once a client accepts, you'll see what's agreed, invoiced and paid here.</p>
    ) : (
      <div className="space-y-3">
        <Bar label="Agreed (accepted quotes)" value={data.quoted} of={data.quoted} color="bg-emerald-500" />
        <Bar label="Invoiced" value={data.invoiced} of={data.quoted} color="bg-sky-500" />
        <Bar label="Paid" value={data.paid} of={data.quoted} color="bg-purple-500" />
        <p className="pt-1 text-sm text-slate-600">
          <b>{money(data.still_to_invoice)}</b> still to invoice.{" "}
          <Link to="/programs" className="text-emerald-700 hover:underline">Open programs</Link>
        </p>
      </div>
    )}
  </Panel>
);

const Ranking = ({ rows, empty, render }) =>
  rows?.length ? (
    <ol className="space-y-2">
      {rows.map((row, i) => {
        const top = rows[0].revenue || 1;
        return (
          <li key={row.client_id ?? row.product_id} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-slate-700"><span className="mr-2 text-xs text-slate-400">{i + 1}</span>{render(row)}</span>
              <span className="shrink-0 font-medium text-slate-800">{money(row.revenue)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(row.revenue / top) * 100}%` }} /></div>
          </li>
        );
      })}
    </ol>
  ) : <p className="text-sm text-slate-400">{empty}</p>;

export const TopClients = ({ rows }) => (
  <Panel icon={<Crown size={18} className="text-amber-500" />} title="Top clients (12 months)">
    <Ranking rows={rows} empty="No invoices in the last 12 months." render={(r) => <Link to={`/clients/${r.client_id}`} className="hover:underline">{r.name}</Link>} />
  </Panel>
);

export const TopProducts = ({ rows }) => (
  <Panel icon={<Package size={18} className="text-orange-500" />} title="Best sellers (12 months)">
    <Ranking rows={rows} empty="No products sold in the last 12 months."
      render={(r) => <><Link to="/products" className="hover:underline">{r.name}</Link> <span className="text-xs text-slate-400">× {r.quantity}</span></>} />
  </Panel>
);
