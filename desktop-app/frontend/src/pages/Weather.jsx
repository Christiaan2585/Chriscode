import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sun, Moon, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle,
  MapPin, Navigation, Droplets, Wind, Thermometer, Sunrise, Sunset, AlertTriangle, CheckCircle2, Search,
} from "lucide-react";

// Location: the first visit asks for this computer's location once
// (Electron shows a real "Allow location access?" prompt - see
// registerPermissionHandler in desktop-app/index.js - then Windows'
// own location service answers, no API key needed). If that's declined
// or unavailable, a town search (Open-Meteo geocoding) is the fallback.
// The chosen location is remembered on this computer.
const LOCATION_KEY = "sandveld_weather_location"; // {lat, lon, label, source}
const ASKED_KEY = "sandveld_weather_permission_asked";
const REFRESH_MS = 30 * 60 * 1000;

// Livestock alert thresholds for the 7-day outlook.
const FROST_MIN_C = 2;
const HEAT_MAX_C = 32;
const HEAVY_RAIN_MM = 20;
const STRONG_WIND_KMH = 40;

const FORECAST_URL = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code,is_day" +
  "&hourly=temperature_2m,precipitation_probability,weather_code" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset" +
  "&timezone=auto&forecast_days=7";

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable - works for this session, just isn't remembered.
  }
}

function readLocation() {
  try {
    return JSON.parse(readStored(LOCATION_KEY)) || null;
  } catch {
    return null;
  }
}

// WMO weather codes as returned by Open-Meteo.
function describe(code, isDay = true) {
  if (code === 0) return { label: "Clear", Icon: isDay ? Sun : Moon };
  if (code === 1 || code === 2) return { label: "Partly cloudy", Icon: isDay ? CloudSun : Cloud };
  if (code === 3) return { label: "Overcast", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Fog", Icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Drizzle", Icon: CloudDrizzle };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "Rain", Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Snow", Icon: CloudSnow };
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "Cloudy", Icon: Cloud };
}

const compass = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
const dayName = (iso, i) =>
  i === 0 ? "Today" : new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const clock = (iso) => iso.slice(11, 16);

function livestockAlerts(daily) {
  const alerts = [];
  daily.time.forEach((day, i) => {
    const when = dayName(day, i);
    if (daily.temperature_2m_min[i] <= FROST_MIN_C)
      alerts.push({ level: "high", text: `${when}: frost risk overnight (${Math.round(daily.temperature_2m_min[i])}°C) - shelter young stock, check water troughs.` });
    if (daily.temperature_2m_max[i] >= HEAT_MAX_C)
      alerts.push({ level: "high", text: `${when}: heat stress risk (${Math.round(daily.temperature_2m_max[i])}°C) - ensure shade and water; avoid handling in the heat of the day.` });
    if (daily.precipitation_sum[i] >= HEAVY_RAIN_MM)
      alerts.push({ level: "medium", text: `${when}: heavy rain (${Math.round(daily.precipitation_sum[i])} mm) - watch low-lying camps and access roads.` });
    if (daily.wind_speed_10m_max[i] >= STRONG_WIND_KMH)
      alerts.push({ level: "medium", text: `${when}: strong wind (${Math.round(daily.wind_speed_10m_max[i])} km/h) - not a good day for spraying.` });
  });
  return alerts;
}

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const LocationPicker = ({ reason, onUseDevice, onPick, onCancel }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const latest = useRef("");

  const search = async (q) => {
    setQuery(q);
    latest.current = q;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en&format=json`
      );
      const found = (await res.json()).results || [];
      // Ignore a slow reply to an earlier keystroke.
      if (latest.current === q) setResults(found);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card className="p-6 max-w-lg space-y-4">
      <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <MapPin size={18} className="text-emerald-600" /> Choose a location
      </h3>
      {reason && <p className="text-sm text-amber-700">{reason}</p>}
      <button type="button" onClick={onUseDevice}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700">
        <Navigation size={16} /> Use this computer's location
      </button>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="flex-1 h-px bg-slate-200" /> or search for a town <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="e.g. Oudtshoorn"
          className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      {searching && <p className="text-xs text-slate-400">Searching...</p>}
      {results.length > 0 && (
        <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-auto">
          {results.map((r) => {
            const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
            return (
              <li key={`${r.latitude}-${r.longitude}`}>
                <button type="button" onClick={() => onPick({ lat: r.latitude, lon: r.longitude, label, source: "manual" })}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
      )}
    </Card>
  );
};

const Weather = () => {
  const [location, setLocation] = useState(readLocation);
  // "ready" | "asking" | "choose"
  const [status, setStatus] = useState(() => (readLocation() ? "ready" : readStored(ASKED_KEY) ? "choose" : "asking"));
  const [reason, setReason] = useState(null);

  const locateDevice = () => {
    if (!navigator.geolocation) {
      setReason("This computer can't provide its location - search for a town instead.");
      setStatus("choose");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        writeStored(ASKED_KEY, "1");
        choose({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "This computer's location", source: "device" });
      },
      () => {
        writeStored(ASKED_KEY, "1");
        setReason("Location access wasn't allowed (or Windows location is turned off) - search for a town instead.");
        setStatus("choose");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60 * 60 * 1000 }
    );
  };

  const choose = (loc) => {
    writeStored(LOCATION_KEY, JSON.stringify(loc));
    setLocation(loc);
    setReason(null);
    setStatus("ready");
  };

  // First visit only: ask once, automatically.
  useEffect(() => {
    if (status === "asking" && !location) locateDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const forecast = useQuery({
    queryKey: ["weather", location?.lat, location?.lon],
    queryFn: async () => {
      const res = await fetch(FORECAST_URL(location.lat, location.lon));
      if (!res.ok) throw new Error("Weather service unavailable");
      return res.json();
    },
    enabled: status === "ready" && !!location,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
    retry: 1,
  });

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-3xl font-bold text-slate-800">Weather</h2>
        <p className="text-slate-500 flex items-center gap-1.5">
          <MapPin size={14} /> {status === "ready" && location ? location.label : "Local forecast"}
        </p>
      </div>
      {status === "ready" && (
        <button type="button" onClick={() => setStatus("choose")}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
          Change location
        </button>
      )}
    </div>
  );

  if (status === "asking") {
    return (
      <div className="space-y-6">
        {header}
        <Card className="p-6 text-sm text-slate-500">Finding this computer's location...</Card>
      </div>
    );
  }

  if (status === "choose") {
    return (
      <div className="space-y-6">
        {header}
        <LocationPicker reason={reason} onUseDevice={locateDevice} onPick={choose}
          onCancel={location ? () => setStatus("ready") : null} />
      </div>
    );
  }

  if (forecast.isLoading) {
    return <div className="space-y-6">{header}<Card className="p-6 text-sm text-slate-500">Loading forecast...</Card></div>;
  }
  if (forecast.isError || !forecast.data?.current) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="p-6 text-sm text-red-600">
          Couldn't load the forecast - check the internet connection. It will retry automatically.
        </Card>
      </div>
    );
  }

  const { current, hourly, daily } = forecast.data;
  const now = describe(current.weather_code, current.is_day === 1);
  const currentHour = current.time.slice(0, 13);
  const start = Math.max(0, hourly.time.findIndex((t) => t.slice(0, 13) >= currentHour));
  const next24 = hourly.time.slice(start, start + 24).map((t, j) => ({
    time: t,
    temp: hourly.temperature_2m[start + j],
    rain: hourly.precipitation_probability[start + j],
    code: hourly.weather_code[start + j],
  }));
  const weekMin = Math.min(...daily.temperature_2m_min);
  const weekMax = Math.max(...daily.temperature_2m_max);
  const span = Math.max(1, weekMax - weekMin);
  const alerts = livestockAlerts(daily);

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-5">
            <now.Icon size={64} className="text-emerald-600 shrink-0" />
            <div>
              <div className="text-5xl font-bold text-slate-800">{Math.round(current.temperature_2m)}°C</div>
              <div className="text-slate-500">
                {now.label} · feels like {Math.round(current.apparent_temperature)}°C
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-sm">
            <Stat Icon={Droplets} label="Humidity" value={`${current.relative_humidity_2m}%`} />
            <Stat Icon={Wind} label="Wind" value={`${Math.round(current.wind_speed_10m)} km/h ${compass(current.wind_direction_10m)}`} />
            <Stat Icon={Sunrise} label="Sunrise" value={clock(daily.sunrise[0])} />
            <Stat Icon={Sunset} label="Sunset" value={clock(daily.sunset[0])} />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" /> Livestock weather alerts
          </h3>
          {alerts.length === 0 ? (
            <p className="flex items-start gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> No frost, heat stress, heavy rain or strong wind expected this week.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={i} className={`text-sm rounded-lg p-2.5 ${a.level === "high" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                  {a.text}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Next 24 hours</h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {next24.map((h, i) => {
            const d = describe(h.code, Number(h.time.slice(11, 13)) >= 6 && Number(h.time.slice(11, 13)) < 19);
            return (
              <div key={h.time} className="shrink-0 w-16 flex flex-col items-center gap-1.5 rounded-lg py-2 text-sm">
                <span className="text-xs text-slate-500">{i === 0 ? "Now" : clock(h.time)}</span>
                <d.Icon size={20} className="text-slate-600" />
                <span className="font-semibold text-slate-800">{Math.round(h.temp)}°</span>
                <span className={`text-xs ${h.rain >= 50 ? "text-blue-600" : "text-slate-400"}`}>{h.rain}%</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="divide-y divide-slate-100">
        <h3 className="font-semibold text-slate-800 px-6 pt-6 pb-4">7-day forecast</h3>
        {daily.time.map((day, i) => {
          const d = describe(daily.weather_code[i]);
          const lo = daily.temperature_2m_min[i];
          const hi = daily.temperature_2m_max[i];
          return (
            <div key={day} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem_minmax(7rem,1.6fr)_4.5rem] items-center gap-4 px-6 py-3 text-sm">
              <span className="font-medium text-slate-700">{dayName(day, i)}</span>
              <span className="flex items-center gap-2 text-slate-600">
                <d.Icon size={20} className="text-emerald-600 shrink-0" /> {d.label}
              </span>
              <span className="text-blue-600 text-xs" title="Chance of rain / expected rainfall">
                {daily.precipitation_probability_max[i]}%{daily.precipitation_sum[i] > 0 ? ` · ${daily.precipitation_sum[i]} mm` : ""}
              </span>
              <span className="flex items-center gap-2">
                <span className="w-8 text-right text-slate-400">{Math.round(lo)}°</span>
                <span className="relative flex-1 h-1.5 rounded-full bg-slate-100">
                  <span className="absolute h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-amber-400"
                    style={{ left: `${((lo - weekMin) / span) * 100}%`, right: `${100 - ((hi - weekMin) / span) * 100}%` }} />
                </span>
                <span className="w-8 text-slate-800 font-semibold">{Math.round(hi)}°</span>
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                <Wind size={12} /> {Math.round(daily.wind_speed_10m_max[i])} km/h
              </span>
            </div>
          );
        })}
      </Card>

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <Thermometer size={12} /> Forecast from Open-Meteo, refreshed every 30 minutes.
      </p>
    </div>
  );
};

const Stat = ({ Icon, label, value }) => (
  <div>
    <div className="flex items-center gap-1.5 text-slate-400 text-xs"><Icon size={14} /> {label}</div>
    <div className="font-semibold text-slate-800 mt-0.5">{value}</div>
  </div>
);

export default Weather;
