import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, CloudOff, CloudSun, MessageCircle, PackageX, Phone, ServerCog } from "lucide-react";
import apiClient from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { toTelLink, toWhatsAppLink } from "../../utils/contact";
import { farmLabel } from "../../utils/format";
import { PREF_KEYS, readPref } from "../../utils/preferences";
import { subscribeOutbox } from "../../utils/outbox";
import { getUpdateStatus, isUpdaterAvailable, onUpdateStatus } from "../../utils/updater";
import { FORECAST_URL, describe, livestockAlerts } from "../../utils/weather";
import { Panel } from "./MoneyPanels";

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const Visit = ({ visit, client }) => {
  const tel = toTelLink(client?.phone);
  const wa = toWhatsAppLink(client?.phone, `Hi ${client?.name?.split(" ")[0] || ""}, `);
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
      <span className="w-14 shrink-0 font-medium text-slate-700">{visit.time || ""}</span>
      <span className="min-w-0 flex-1">
        <Link to={`/clients/${visit.client_id}`} className="font-medium text-slate-800 hover:underline">{farmLabel(client) || `Client #${visit.client_id}`}</Link>
        <span className="block truncate text-xs text-slate-500">{visit.reason}</span>
      </span>
      {tel && <a href={tel} aria-label={`Call ${farmLabel(client)}`} className="p-1.5 text-slate-400 hover:text-blue-600"><Phone size={16} /></a>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${farmLabel(client)}`} className="p-1.5 text-slate-400 hover:text-emerald-600"><MessageCircle size={16} /></a>}
    </li>
  );
};

// Today's visits with call / WhatsApp buttons, then the next few.
export const Visits = ({ appointments, clients }) => {
  const byId = Object.fromEntries((clients || []).map((c) => [c.id, c]));
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const open = (appointments || []).filter((a) => a.status !== "completed" && a.status !== "cancelled");
  const today = open.filter((a) => sameDay(new Date(a.date), midnight)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const next = open.filter((a) => new Date(a.date) > midnight && !sameDay(new Date(a.date), midnight))
    .sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5);

  return (
    <Panel icon={<CalendarClock size={18} className="text-emerald-600" />} title="Visits">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today</h4>
      {today.length === 0 ? <p className="mb-3 mt-1 text-sm text-slate-400">No visits today.</p>
        : <ul className="mb-3">{today.map((v) => <Visit key={v.id} visit={v} client={byId[v.client_id]} />)}</ul>}
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coming up</h4>
      {next.length === 0 ? <p className="mt-1 text-sm text-slate-400">Nothing scheduled.</p> : (
        <ul>
          {next.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
              <span className="w-20 shrink-0 text-slate-600">{new Date(v.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })} {v.time}</span>
              <Link to={`/clients/${v.client_id}`} className="min-w-0 flex-1 truncate text-slate-800 hover:underline">
                {farmLabel(byId[v.client_id]) || `Client #${v.client_id}`} <span className="text-xs text-slate-500">- {v.reason}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/calendar" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">Open the calendar</Link>
    </Panel>
  );
};

const savedLocation = () => {
  try {
    return JSON.parse(readPref(PREF_KEYS.weatherLocation)) || null;
  } catch {
    return null;
  }
};

// A glance at today's weather and the livestock alerts, for the location saved on the Weather page.
export const WeatherGlance = () => {
  const location = savedLocation();
  const forecast = useQuery({
    queryKey: ["weather", location?.lat, location?.lon], // the Weather page's own key, so they share one fetch
    queryFn: async () => {
      const res = await fetch(FORECAST_URL(location.lat, location.lon));
      if (!res.ok) throw new Error("Weather service unavailable");
      return res.json();
    },
    enabled: Boolean(location),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
  const data = forecast.data;
  const { label, Icon } = data ? describe(data.current.weather_code, data.current.is_day === 1) : {};
  const alerts = data ? livestockAlerts(data.daily).slice(0, 2) : [];

  return (
    <Panel icon={<CloudSun size={18} className="text-sky-500" />} title="Weather">
      {!location ? (
        <p className="text-sm text-slate-500">Pick your location on the <Link to="/weather" className="text-emerald-700 hover:underline">Weather page</Link> to see the day and any frost, heat or rain alerts here.</p>
      ) : forecast.isError ? (
        <p className="text-sm text-slate-400">Couldn't load the weather right now.</p>
      ) : !data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Icon size={36} className="text-sky-500" aria-hidden="true" />
            <div>
              <div className="text-2xl font-bold text-slate-800">{Math.round(data.current.temperature_2m)}°C</div>
              <div className="text-xs text-slate-500">{label} · {location.label || "your location"}</div>
            </div>
            <div className="ml-auto text-right text-xs text-slate-500">
              <div>{Math.round(data.daily.temperature_2m_min[0])}° / {Math.round(data.daily.temperature_2m_max[0])}°</div>
              <div>{data.daily.precipitation_probability_max[0] ?? 0}% rain</div>
            </div>
          </div>
          {alerts.length === 0 ? <p className="text-xs text-emerald-700">No livestock alerts this week.</p>
            : <ul className="space-y-1">{alerts.map((a) => <li key={a.text} className={`rounded-lg px-2 py-1 text-xs ${a.level === "high" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{a.text}</li>)}</ul>}
          <Link to="/weather" className="inline-block text-sm font-medium text-emerald-700 hover:underline">Full forecast</Link>
        </div>
      )}
    </Panel>
  );
};

export const LowStock = ({ data }) => (
  <Panel icon={<PackageX size={18} className="text-red-500" />} title="Out of stock">
    {!data || data.count === 0 ? <p className="text-sm text-slate-400">Everything is in stock.</p> : (
      <>
        <ul className="space-y-1 text-sm text-slate-700">{data.items.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
        {data.count > data.items.length && <p className="mt-1 text-xs text-slate-500">and {data.count - data.items.length} more</p>}
        <Link to="/products" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">Open products</Link>
      </>
    )}
  </Panel>
);

const ago = (iso) => {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  return hours < 1 ? "less than an hour ago" : hours < 48 ? `${hours} ${hours === 1 ? "hour" : "hours"} ago` : `${Math.round(hours / 24)} days ago`;
};

const StatusLine = ({ ok, children }) => (
  <li className="flex items-start gap-2 text-sm text-slate-700">
    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ok === true ? "bg-emerald-500" : ok === false ? "bg-red-500" : "bg-amber-500"}`} aria-hidden="true" />
    <span>{children}</span>
  </li>
);

// The backend, the last backup, whether an update is waiting, and changes still waiting to sync (phone).
export const SystemStatus = ({ backendUp }) => {
  const { user } = useAuth();
  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: async () => (await apiClient.get("/backups/")).data,
    enabled: Boolean(user?.is_admin),
    retry: false,
  });
  const [update, setUpdate] = useState(null);
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!isUpdaterAvailable()) return undefined;
    getUpdateStatus().then(setUpdate).catch(() => {});
    return onUpdateStatus(setUpdate);
  }, []);
  useEffect(() => subscribeOutbox((queue) => setWaiting(queue.length)), []);

  const last = backups.data?.backups?.[0];
  return (
    <Panel icon={<ServerCog size={18} className="text-slate-500" />} title="System status">
      <ul className="space-y-2">
        <StatusLine ok={backendUp}>{backendUp ? "Backend connected" : "Can't reach the backend - is it running?"}</StatusLine>
        {user?.is_admin && backups.data && (
          <StatusLine ok={backups.data.last_error ? false : last ? Date.now() - new Date(last.created_at).getTime() < 36 * 3600000 : null}>
            {backups.data.last_error ? `Last backup failed: ${backups.data.last_error}` : last ? `Last backup ${ago(last.created_at)}` : "No backup yet"}
          </StatusLine>
        )}
        {update?.state === "downloaded" && <StatusLine ok={null}>Version {update.version} is ready - restart to install (Settings)</StatusLine>}
        {update?.state === "downloading" && <StatusLine ok={null}>Downloading an update{update.percent ? ` (${Math.round(update.percent)}%)` : ""}…</StatusLine>}
        {update?.state === "up-to-date" && <StatusLine ok>App is up to date</StatusLine>}
        {waiting > 0 && (
          <li className="flex items-start gap-2 text-sm text-amber-800"><CloudOff size={14} className="mt-1 shrink-0" />{waiting} {waiting === 1 ? "change" : "changes"} waiting to sync with the office PC</li>
        )}
      </ul>
    </Panel>
  );
};
