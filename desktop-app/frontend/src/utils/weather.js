import {
  Sun, Moon, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle,
} from "lucide-react";

// Shared by the Weather page and the dashboard's weather card.

// Livestock alert thresholds for the 7-day outlook.
const FROST_MIN_C = 2;
const HEAT_MAX_C = 32;
const HEAVY_RAIN_MM = 20;
const STRONG_WIND_KMH = 40;

export const FORECAST_URL = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code,is_day" +
  "&hourly=temperature_2m,precipitation_probability,weather_code" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset" +
  "&timezone=auto&forecast_days=7";

// WMO weather codes as returned by Open-Meteo.
export function describe(code, isDay = true) {
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

export const dayName = (iso, i) =>
  i === 0 ? "Today" : new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export function livestockAlerts(daily) {
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
