import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TrendingUp, Users, AlertCircle, CalendarClock, ClipboardList, LineChart as LineChartIcon } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import apiClient from "../api/client";
import { STEP_STATUS, dayLabel } from "../utils/herding";

// YYYY-MM-DD for today plus `offset` days, in local time.
const localDay = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const Dashboard = () => {
  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await apiClient.get("/clients/")).data,
  });
  const revenueQuery = useQuery({
    queryKey: ["analytics", "revenue"],
    queryFn: async () => (await apiClient.get("/analytics/revenue")).data,
  });
  const overdueQuery = useQuery({
    queryKey: ["schedules", "overdue"],
    queryFn: async () => (await apiClient.get("/schedules/overdue")).data,
  });
  const appointmentsQuery = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => (await apiClient.get("/appointments/")).data,
  });
  const programStepsQuery = useQuery({
    queryKey: ["program-calendar", "dashboard"],
    queryFn: async () => (await apiClient.get("/programs/calendar", { params: { start: localDay(-60), end: localDay(7) } })).data,
  });
  const salesChartQuery = useQuery({
    queryKey: ["analytics", "revenue-by-month"],
    queryFn: async () => (await apiClient.get("/analytics/revenue-by-month", { params: { months: 12 } })).data,
  });

  const queries = [clientsQuery, revenueQuery, overdueQuery, appointmentsQuery, salesChartQuery];
  const isLoading = queries.some((q) => q.isLoading);
  const isBackendUp = !queries.some((q) => q.isError);

  const fmtCurrency = (n) =>
    `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingAppointments = (appointmentsQuery.data || [])
    .filter((a) => new Date(a.date) >= today && a.status !== "completed")
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
  // Not ticked off yet and dated up to a week ahead (overdue ones first, by date).
  const programSteps = (programStepsQuery.data || []).filter((s) => s.status === "overdue" || s.status === "due");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-slate-800">Dashboard Overview</h2>
        <div className="text-sm text-slate-500">
          {today.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          icon={<Users className="text-emerald-600" />}
          label="Total Clients"
          value={isLoading ? "…" : clientsQuery.data?.length ?? 0}
        />
        <StatCard
          icon={<TrendingUp className="text-purple-600" />}
          label="Total Revenue"
          value={isLoading ? "…" : fmtCurrency(revenueQuery.data?.total_revenue)}
          sub={
            !isLoading && revenueQuery.data
              ? `${fmtCurrency(revenueQuery.data.outstanding_balance)} outstanding`
              : null
          }
        />
        <StatCard
          icon={<AlertCircle className="text-red-600" />}
          label="Overdue Treatments"
          value={isLoading ? "…" : overdueQuery.data?.length ?? 0}
        />
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800">
          <ClipboardList size={18} className="text-emerald-600" /> Herding Program - This Week
        </h3>
        {programSteps.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing due on any client's herding program this week.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {programSteps.slice(0, 8).map((s) => (
              <li key={`${s.program_id}-${s.step_id}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-medium text-slate-700">{dayLabel(s.date, { day: "numeric", month: "short" })}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STEP_STATUS[s.status].className}`}>{STEP_STATUS[s.status].label}</span>
                <span className="min-w-0 flex-1 text-slate-700">{s.stage || s.program_name}</span>
                <Link to={`/clients/${s.client_id}`} className="text-emerald-700 hover:underline">{s.client_name}</Link>
              </li>
            ))}
          </ul>
        )}
        {programSteps.length > 8 && (
          <Link to="/calendar" className="mt-2 inline-block text-sm text-emerald-700 hover:underline">
            {programSteps.length - 8} more in the calendar
          </Link>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800">
          <LineChartIcon size={18} className="text-purple-600" /> Sales — Last 12 Months
        </h3>
        {salesChartQuery.isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !salesChartQuery.data?.some((m) => m.revenue > 0) ? (
          <p className="text-sm text-slate-400">No paid invoices yet — this chart fills in as invoices get marked paid.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={salesChartQuery.data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(v) => `R${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                width={56}
              />
              <Tooltip formatter={(value) => [fmtCurrency(value), "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#salesFill)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800">
            <CalendarClock size={18} className="text-emerald-600" /> Upcoming Appointments
          </h3>
          <div className="space-y-2">
            {upcomingAppointments.length === 0 && (
              <p className="text-sm text-slate-400">No upcoming appointments scheduled.</p>
            )}
            {upcomingAppointments.map((app) => (
              <div key={app.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                <div className="flex-1 text-sm text-slate-700">
                  <span className="font-medium">{app.reason}</span> — Client #{app.client_id}
                </div>
                <div className="text-xs text-slate-400">{new Date(app.date).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-slate-800">System Status</h3>
          <div
            className={`flex items-center gap-3 p-4 rounded-lg ${
              isBackendUp ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            <div className={`w-3 h-3 rounded-full ${isBackendUp ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></div>
            <span className="text-sm font-medium">
              {isBackendUp ? "Backend connected and operational" : "Can't reach the backend — is it running?"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, sub }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
    <div className="mb-4">
      <div className="p-2 bg-slate-100 rounded-lg w-fit">{icon}</div>
    </div>
    <div className="text-2xl font-bold text-slate-800">{value}</div>
    <div className="text-sm text-slate-500">{label}</div>
    {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
  </div>
);

export default Dashboard;
