import React from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, Dog, AlertCircle, CalendarClock, LineChart as LineChartIcon } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import apiClient from "../api/client";

const Dashboard = () => {
  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await apiClient.get("/clients/")).data,
  });
  const animalsQuery = useQuery({
    queryKey: ["animals"],
    queryFn: async () => (await apiClient.get("/animals/")).data,
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
  const salesChartQuery = useQuery({
    queryKey: ["analytics", "revenue-by-month"],
    queryFn: async () => (await apiClient.get("/analytics/revenue-by-month", { params: { months: 12 } })).data,
  });

  const queries = [clientsQuery, animalsQuery, revenueQuery, overdueQuery, appointmentsQuery, salesChartQuery];
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-slate-800">Dashboard Overview</h2>
        <div className="text-sm text-slate-500">
          {today.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Users className="text-emerald-600" />}
          label="Total Clients"
          value={isLoading ? "…" : clientsQuery.data?.length ?? 0}
        />
        <StatCard
          icon={<Dog className="text-blue-600" />}
          label="Registered Animals"
          value={isLoading ? "…" : animalsQuery.data?.length ?? 0}
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
          <LineChartIcon size={18} className="text-purple-600" /> Sales — Last 12 Months
        </h3>
        {salesChartQuery.isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !salesChartQuery.data?.some((m) => m.revenue > 0) ? (
          <p className="text-sm text-slate-400">No paid invoices yet — this chart fills in as invoices get marked paid.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={salesChartQuery.data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(v) => `R${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                width={56}
              />
              <Tooltip formatter={(value) => [fmtCurrency(value), "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
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
