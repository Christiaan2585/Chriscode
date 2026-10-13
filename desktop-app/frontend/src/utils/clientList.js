import { farmLabel } from "./format.js";

// The Clients page's filters and sorting (pages/Clients.jsx). `headcounts` is {client id: animals} from
// GET /clients/headcounts - a client with no recorded headcount is simply missing from it.
export const NO_TOWN = "__none__";

export const SORTS = [
  { value: "name", label: "Name (A-Z)" },
  { value: "animals-high", label: "Most animals first" },
  { value: "animals-low", label: "Fewest animals first" },
  { value: "town", label: "Town (A-Z)" },
];

const tidy = (town) => (town || "").trim().replace(/\s+/g, " ");
const key = (town) => tidy(town).toLowerCase();
const byName = (a, b) => farmLabel(a).localeCompare(farmLabel(b), undefined, { sensitivity: "base" });
const limit = (value) => (value === "" || value == null || Number.isNaN(Number(value)) ? null : Number(value));

// Each town once, as the first client spelled it, in A-Z order.
export function townsOf(clients) {
  const seen = new Map();
  for (const c of clients) if (tidy(c.town) && !seen.has(key(c.town))) seen.set(key(c.town), tidy(c.town));
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function filterAndSort(clients, headcounts, { search = "", town = "", minAnimals = "", maxAnimals = "", sort = "name" } = {}) {
  const q = search.trim().toLowerCase();
  const min = limit(minAnimals);
  const max = limit(maxAnimals);
  const list = clients.filter((c) => {
    if (q && ![c.name, c.farm_name, c.email, c.phone, c.town].some((v) => v?.toLowerCase().includes(q))) return false;
    if (town === NO_TOWN ? tidy(c.town) : town && key(c.town) !== key(town)) return false;
    if (min !== null || max !== null) {
      const animals = headcounts?.[c.id];
      if (animals === undefined || (min !== null && animals < min) || (max !== null && animals > max)) return false;
    }
    return true;
  });
  // Unknown values always go last, whichever way the list is sorted.
  const animals = (c) => headcounts?.[c.id];
  const by = {
    name: byName,
    town: (a, b) => (!tidy(a.town) - !tidy(b.town)) || tidy(a.town).localeCompare(tidy(b.town), undefined, { sensitivity: "base" }) || byName(a, b),
    "animals-high": (a, b) => (animals(a) === undefined) - (animals(b) === undefined) || (animals(b) ?? 0) - (animals(a) ?? 0) || byName(a, b),
    "animals-low": (a, b) => (animals(a) === undefined) - (animals(b) === undefined) || (animals(a) ?? 0) - (animals(b) ?? 0) || byName(a, b),
  };
  return [...list].sort(by[sort] || byName);
}
