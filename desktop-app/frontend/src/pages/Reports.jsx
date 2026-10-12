import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import apiClient from "../api/client";
import { clientService } from "../api/services";
import DocumentPreview from "../components/DocumentPreview";
import { saveBlob, statementFor } from "../utils/documents";
import { money } from "../utils/format";

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
const input = "rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const BUCKETS = [["current", "Not due yet"], ["days_30", "1-30 days"], ["days_60", "31-60 days"], ["days_90", "61-90 days"], ["older", "Over 90 days"]];

const Period = ({ value, onChange }) => (
  <div className="flex flex-wrap items-end gap-2 text-sm">
    <label><span className="block text-xs text-slate-500">From</span>
      <input type="date" className={input} value={value.start} max={value.end} onChange={(e) => onChange({ ...value, start: e.target.value })} /></label>
    <label><span className="block text-xs text-slate-500">To</span>
      <input type="date" className={input} value={value.end} min={value.start} onChange={(e) => onChange({ ...value, end: e.target.value })} /></label>
  </div>
);

// Who owes what and for how long (app/core/reports.py), statements per client, and the bookkeeper's Excel file.
const Reports = () => {
  const { data } = useQuery({ queryKey: ["aged-debtors"], queryFn: async () => (await apiClient.get("/reports/aged-debtors")).data });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.getAll });
  const [statementPeriod, setStatementPeriod] = useState({ start: daysAgo(90), end: daysAgo(0) });
  const [exportPeriod, setExportPeriod] = useState({ start: daysAgo(30), end: daysAgo(0) });
  const [preview, setPreview] = useState(null);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);

  const openStatement = (clientId) => {
    const client = clients?.find((c) => c.id === clientId);
    if (client) setPreview(statementFor(client, statementPeriod.start, statementPeriod.end));
  };

  const exportAccounts = async () => {
    setExporting(true);
    setExportError("");
    try {
      const { start, end } = exportPeriod;
      const res = await apiClient.get(`/reports/accounting.xlsx?start=${start}&end=${end}`, { responseType: "blob", silent: true });
      await saveBlob(res.data, `Sandveld accounts ${start} to ${end}.xlsx`);
    } catch {
      setExportError("Couldn't make the export. Check the dates and try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app-bg space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-800">Reports</h2>
        <p className="text-slate-500">Who owes what, statements for clients, and the export for your accountant.</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Who owes money</h3>
            <p className="text-sm text-slate-500">Unpaid amounts by how long they are past the due date{data ? `, as of ${data.as_of}` : ""}.</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Statement period</p>
            <Period value={statementPeriod} onChange={setStatementPeriod} />
          </div>
        </div>
        {!data ? <p className="p-6 text-sm text-slate-500">Loading...</p> : !data.clients.length ? (
          <p className="p-6 text-sm text-slate-500">Nobody owes anything. Well done.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="card-table w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Client</th>
                  {BUCKETS.map(([key, label]) => <th key={key} className="px-4 py-3 text-right font-medium">{label}</th>)}
                  <th className="px-4 py-3 text-right font-medium">Total owed</th>
                  <th className="px-4 py-3 text-right font-medium">Statement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.clients.map((row) => (
                  <tr key={row.client_id}>
                    <td data-primary className="px-4 py-3 font-medium text-slate-800">
                      <Link to={`/clients/${row.client_id}`} className="hover:text-emerald-700 hover:underline">{row.name}</Link>
                    </td>
                    {BUCKETS.map(([key, label]) => (
                      <td key={key} data-label={label} className={`px-4 py-3 text-right ${row[key] && key !== "current" ? "font-medium text-red-700" : "text-slate-600"}`}>
                        {row[key] ? money(row[key]) : "-"}
                      </td>
                    ))}
                    <td data-key className="px-4 py-3 text-right font-semibold text-slate-800">{money(row.total)}</td>
                    <td data-actions className="px-4 py-3 text-right">
                      <button type="button" onClick={() => openStatement(row.client_id)} disabled={!clients}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-400 disabled:opacity-50">
                        <FileText size={14} /> Statement
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td data-primary className="px-4 py-3">Total</td>
                  {BUCKETS.map(([key, label]) => <td key={key} data-label={label} className="px-4 py-3 text-right">{money(data.totals[key])}</td>)}
                  <td data-key className="px-4 py-3 text-right">{money(data.totals.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section data-admin-only className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800">Export for the accountant</h3>
        <p className="mb-3 text-sm text-slate-500">An Excel file with the invoices, payments, credit notes and a VAT summary per month for the dates you choose.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Period value={exportPeriod} onChange={setExportPeriod} />
          <button type="button" onClick={exportAccounts} disabled={exporting || !exportPeriod.start || !exportPeriod.end}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            <Download size={16} /> {exporting ? "Making it..." : "Download Excel"}
          </button>
        </div>
        {exportError && <p role="alert" className="mt-2 text-sm text-red-600">{exportError}</p>}
      </section>

      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
};

export default Reports;
