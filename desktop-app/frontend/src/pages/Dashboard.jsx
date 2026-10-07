import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertCircle, Banknote, Bell, CalendarPlus, FilePlus2, FileText, LineChart as LineChartIcon, TrendingUp, UserPlus, Users,
} from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import apiClient from "../api/client";
import AttentionList from "../components/dashboard/AttentionList";
import { LowStock, SystemStatus, Visits, WeatherGlance } from "../components/dashboard/DayPanels";
import { Panel, ProgramMoney, TopClients, TopProducts } from "../components/dashboard/MoneyPanels";
import { money } from "../utils/format";

const QUICK_ACTIONS = [
  ["New client", "/clients?new=1", UserPlus],
  ["New quote", "/programs?new=1", FileText],
  ["New invoice", "/invoices?new=1", FilePlus2],
  ["Schedule a visit", "/calendar", CalendarPlus],
];

const Dashboard = () => {
  const [filter, setFilter] = useState("all");
  const attentionRef = useRef(null);
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: async () => (await apiClient.get("/clients/")).data });
  const revenueQuery = useQuery({ queryKey: ["analytics", "revenue"], queryFn: async () => (await apiClient.get("/analytics/revenue")).data });
  const appointmentsQuery = useQuery({ queryKey: ["appointments"], queryFn: async () => (await apiClient.get("/appointments/")).data });
  const salesChartQuery = useQuery({
    queryKey: ["analytics", "revenue-by-month"],
    queryFn: async () => (await apiClient.get("/analytics/revenue-by-month", { params: { months: 12 } })).data,
  });
  const boardQuery = useQuery({ queryKey: ["analytics", "dashboard"], queryFn: async () => (await apiClient.get("/analytics/dashboard")).data });

  const queries = [clientsQuery, revenueQuery, boardQuery, appointmentsQuery, salesChartQuery];
  const isLoading = queries.some((q) => q.isLoading);
  const isBackendUp = !queries.some((q) => q.isError);
  const board = boardQuery.data;
  const attention = board?.attention || [];
  const overdueTreatments = attention.filter((a) => (a.type === "treatment" || a.type === "scan") && a.severity === "overdue").length;
  const today = new Date();
  const value = (v) => (isLoading ? "…" : v);

  const showTreatments = () => {
    setFilter("treatments");
    attentionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Dashboard Overview</h2>
          <div className="text-sm text-slate-500">{today.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
        <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(([label, to, Icon]) => (
            <Link key={label} to={to}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-700">
              <Icon size={16} aria-hidden="true" /> {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard to="/clients" icon={<Users className="text-emerald-600" />} label="Total Clients" value={value(clientsQuery.data?.length ?? 0)} />
        <StatCard icon={<TrendingUp className="text-purple-600" />} label="Total Revenue" value={value(money(revenueQuery.data?.total_revenue))}
          sub={!isLoading && revenueQuery.data ? `${money(revenueQuery.data.collected)} collected` : null} />
        <StatCard to="/invoices" tone={board?.money.past_due_count ? "warn" : null} icon={<Banknote className="text-amber-600" />} label="Owed to you"
          value={value(money(board?.money.unpaid_total))}
          sub={board ? `${board.money.unpaid_count} unpaid${board.money.past_due_count ? ` · ${board.money.past_due_count} past due (${money(board.money.past_due_total)})` : ""}` : null} />
        <StatCard to="/programs" icon={<Bell className="text-sky-600" />} label="Quotes waiting" value={value(board?.quotes_waiting.count ?? 0)}
          sub={board?.quotes_waiting.count ? `${money(board.quotes_waiting.total)} · oldest ${board.quotes_waiting.oldest_days} days` : "Nothing waiting for an answer"} />
        <StatCard onClick={showTreatments} tone={overdueTreatments ? "bad" : null} icon={<AlertCircle className="text-red-600" />} label="Overdue treatments"
          value={value(overdueTreatments)}
          sub={board?.older_overdue.steps ? `+ ${board.older_overdue.steps} older, not listed` : "Last two weeks"} />
      </div>

      <section ref={attentionRef} aria-label="Needs attention" className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <AlertCircle size={18} className="text-red-500" /> Needs attention
          {board && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{attention.length}</span>}
        </h3>
        {boardQuery.isLoading ? <p className="text-sm text-slate-400">Loading…</p>
          : <AttentionList items={attention} older={board?.older_overdue} filter={filter} onFilter={setFilter} />}
      </section>

      <Panel icon={<LineChartIcon size={18} className="text-purple-600" />} title="Sales — Last 12 Months">
        {salesChartQuery.isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !salesChartQuery.data?.some((m) => m.revenue > 0 || m.previous_year > 0) ? (
          <p className="text-sm text-slate-400">No paid invoices yet — this chart fills in as invoices get marked paid.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={salesChartQuery.data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(v) => `R${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} width={56} />
              <Tooltip formatter={(v, name) => [money(v), name]} />
              <Legend verticalAlign="top" height={28} />
              <Area type="monotone" dataKey="revenue" name="This year" stroke="#10b981" strokeWidth={2} fill="url(#salesFill)" dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="previous_year" name="Same month last year" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ProgramMoney data={board?.program_money} />
        <TopClients rows={board?.top_clients} />
        <TopProducts rows={board?.top_products} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Visits appointments={appointmentsQuery.data} clients={clientsQuery.data} />
        <WeatherGlance />
        <div className="space-y-6">
          <LowStock data={board?.low_stock} />
          <SystemStatus backendUp={isBackendUp} />
        </div>
      </div>
    </div>
  );
};

const TONES = { warn: "border-amber-300", bad: "border-red-300" };

const StatCard = ({ icon, label, value, sub, to, onClick, tone }) => {
  const body = (
    <>
      <div className="mb-4"><div className="w-fit rounded-lg bg-slate-100 p-2">{icon}</div></div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </>
  );
  const base = `block w-full rounded-xl border bg-white p-6 text-left shadow-sm ${TONES[tone] || "border-slate-200"}`;
  const interactive = `${base} transition-colors hover:border-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`;
  if (to) return <Link to={to} className={interactive}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={interactive}>{body}</button>;
  return <div className={base}>{body}</div>;
};

export default Dashboard;
