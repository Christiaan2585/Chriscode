import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, MapPin, RefreshCw } from "lucide-react";

// Local weather for the area, refreshed automatically every 30 minutes.
//
// Location handling: the very first time this widget mounts (and only then -
// never again after), it calls the browser's standard geolocation API, which
// shows a real "Allow this app to use your location?" prompt (Electron's
// main process is set up in index.js to actually show that prompt - by
// default Electron silently grants this with no dialog at all, which is not
// what we want). If the person declines, or geolocation isn't available,
// this falls back to a simple town search (Open-Meteo's free geocoding
// service) so weather still works - just set once, manually. The choice
// (device location or a manually picked town) is remembered in this
// computer's local storage, and "Change location" clears it and asks again.
const LOCATION_KEY = "sandveld_weather_location"; // {lat, lon, label, source}
const ASKED_KEY = "sandveld_weather_permission_asked";
const REFRESH_MS = 30 * 60 * 1000; // 30 minutes, per the brief

function readStoredLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeLocation(loc) {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
  } catch {
    // Browser storage can be unavailable in rare locked-down setups - the
    // widget still works for this session, it just won't remember next time.
  }
}

// WMO weather codes, as returned by Open-Meteo's "current" block.
function describeWeather(code) {
  if (code === 0) return { label: "Clear sky", Icon: Sun };
  if (code === 1 || code === 2) return { label: "Partly cloudy", Icon: Sun };
  if (code === 3) return { label: "Overcast", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Fog", Icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Drizzle", Icon: CloudRain };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "Rain", Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Snow", Icon: CloudSnow };
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "Weather", Icon: Cloud };
}

const WeatherWidget = () => {
  const [location, setLocation] = useState(readStoredLocation);
  const [status, setStatus] = useState(() => (readStoredLocation() ? "ready" : "idle"));
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState([]);
  const [manualSearching, setManualSearching] = useState(false);

  useEffect(() => {
    if (location) return;

    if (localStorage.getItem(ASKED_KEY)) {
      // Already asked once (accepted or declined) in an earlier session -
      // never prompt again. If it was declined, go straight to manual entry.
      setStatus("manual");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("manual");
      return;
    }

    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        localStorage.setItem(ASKED_KEY, "1");
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Your location", source: "geo" };
        storeLocation(loc);
        setLocation(loc);
        setStatus("ready");
      },
      () => {
        localStorage.setItem(ASKED_KEY, "1");
        setStatus("manual");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60 * 60 * 1000 }
    );
  }, [location]);

  const weatherQuery = useQuery({
    queryKey: ["weather", location?.lat, location?.lon],
    queryFn: async () => {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Weather service unavailable");
      return res.json();
    },
    enabled: !!location,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
    retry: 1,
  });

  const searchManual = async (q) => {
    setManualQuery(q);
    if (q.trim().length < 2) {
      setManualResults([]);
      return;
    }
    setManualSearching(true);
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`
      );
      const data = await res.json();
      setManualResults(data.results || []);
    } catch {
      setManualResults([]);
    } finally {
      setManualSearching(false);
    }
  };

  const pickManualResult = (r) => {
    const loc = {
      lat: r.latitude,
      lon: r.longitude,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      source: "manual",
    };
    storeLocation(loc);
    localStorage.setItem(ASKED_KEY, "1");
    setLocation(loc);
    setStatus("ready");
    setManualQuery("");
    setManualResults([]);
  };

  const changeLocation = () => {
    try {
      localStorage.removeItem(LOCATION_KEY);
      localStorage.removeItem(ASKED_KEY);
    } catch {
      // Nothing to clean up if storage isn't available.
    }
    setLocation(null);
    setManualQuery("");
    setManualResults([]);
    setStatus("idle");
  };

  if (status === "asking") {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-2">
          <MapPin size={18} className="text-emerald-600" /> Weather
        </h3>
        <p className="text-sm text-slate-400">Requesting this computer's location for local weather…</p>
      </div>
    );
  }

  if (status === "manual" || status === "idle") {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <MapPin size={18} className="text-emerald-600" /> Weather
        </h3>
        <p className="text-sm text-slate-500">
          {status === "manual"
            ? "Location access wasn't granted, so search for a town to show its weather instead:"
            : "Search for a town to show its weather:"}
        </p>
        <input
          type="text"
          value={manualQuery}
          onChange={(e) => searchManual(e.target.value)}
          placeholder="e.g. George, Western Cape"
          className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
        />
        {manualSearching && <p className="text-xs text-slate-400">Searching…</p>}
        {manualResults.length > 0 && (
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-auto">
            {manualResults.map((r) => (
              <li key={`${r.latitude}-${r.longitude}`}>
                <button
                  type="button"
                  onClick={() => pickManualResult(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                >
                  {[r.name, r.admin1, r.country].filter(Boolean).join(", ")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const current = weatherQuery.data?.current;
  const { label: condLabel, Icon } = current ? describeWeather(current.weather_code) : { label: "", Icon: Cloud };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <MapPin size={18} className="text-emerald-600" /> {location?.label || "Weather"}
        </h3>
        <button
          type="button"
          onClick={changeLocation}
          title="Change location"
          className="text-slate-400 hover:text-emerald-600 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {weatherQuery.isLoading && <p className="text-sm text-slate-400">Loading weather…</p>}
      {weatherQuery.isError && <p className="text-sm text-red-500">Couldn't load the weather right now.</p>}
      {current && (
        <div className="flex items-center gap-4">
          <Icon size={40} className="text-emerald-600 shrink-0" />
          <div>
            <div className="text-3xl font-bold text-slate-800">{Math.round(current.temperature_2m)}°C</div>
            <div className="text-sm text-slate-500">
              {condLabel} · Wind {Math.round(current.wind_speed_10m)} km/h · Humidity {current.relative_humidity_2m}%
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-300 mt-3">Updates every 30 minutes.</p>
    </div>
  );
};

export default WeatherWidget;
