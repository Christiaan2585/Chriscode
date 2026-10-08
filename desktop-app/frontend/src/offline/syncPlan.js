// "Download everything": asks the office PC for every list and every client's own pages, so each
// answer is kept by the saved-copy adapter (cachingAdapter.js) and the phone can show it later
// without the PC. `get(url, params)` returns the data. One failing request never stops the rest.
import { monthRange } from "../utils/calendarRange.js";

// Lists every screen starts from.
export const BASE_ENDPOINTS = [
  "/clients/", "/products/", "/products/thumbnails", "/invoices/", "/quotes/", "/orders/", "/purchase-orders/", "/suppliers/",
  "/programs/", "/programs/template", "/appointments/", "/animals/", "/rams/", "/herds/", "/business/", "/dosing/",
  "/analytics/dashboard", "/analytics/revenue", "/analytics/revenue-by-month",
];

const CLIENT_PAGES = (id) => [
  `/clients/${id}`, `/clients/${id}/summary`, `/animals/client/${id}`, `/notes/client/${id}`, `/quotes/client/${id}`,
  `/orders/client/${id}`, `/invoices/client/${id}`, `/appointments/client/${id}`, `/rams/client/${id}`,
];

const extraParams = { "/analytics/revenue-by-month": { months: 12 } };

// The months the Calendar page shows around today (it asks for each month's whole week grid).
const calendarMonths = (now = new Date()) =>
  [-1, 0, 1, 2].map((shift) => {
    const d = new Date(now.getFullYear(), now.getMonth() + shift, 1);
    return monthRange(d.getFullYear(), d.getMonth());
  });

const keyOf = (url, params) => `${url}|${params ? JSON.stringify(params) : ""}`;

async function pool(jobs, limit, run) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) await run(jobs[next++]);
  }));
}

export async function downloadEverything({ get, onProgress = () => {}, concurrency = 4, deep = true, signal, now } = {}) {
  const state = { done: 0, total: 0, failed: 0, aborted: false };
  const report = () => onProgress({ done: state.done, total: state.total });
  const grab = async (url, params) => {
    if (signal?.aborted) {
      state.aborted = true;
      return undefined;
    }
    try {
      return await get(url, params);
    } catch {
      state.failed += 1;
      return undefined;
    } finally {
      if (!signal?.aborted) {
        state.done += 1;
        report();
      }
    }
  };
  const runAll = async (items) => {
    state.total += items.length;
    report();
    const out = new Map();
    await pool(items, concurrency, async ([url, params]) => out.set(keyOf(url, params), await grab(url, params)));
    return out;
  };

  const base = [...BASE_ENDPOINTS.map((u) => [u, extraParams[u]]), ...calendarMonths(now).map((r) => ["/programs/calendar", r])];
  const lists = await runAll(base);
  if (!deep || signal?.aborted) return { ...state, aborted: state.aborted || Boolean(signal?.aborted) };

  const list = (url) => {
    const found = lists.get(keyOf(url, extraParams[url]));
    return Array.isArray(found) ? found : [];
  };
  const clients = list("/clients/");
  const programsByClient = await runAll(clients.map((c) => [`/programs/client/${c.id}`]));
  const pages = [
    ...clients.flatMap((c) => CLIENT_PAGES(c.id).map((u) => [u])),
    ...list("/invoices/").map((i) => [`/invoices/${i.id}/items`]),
    ...list("/quotes/").map((q) => [`/quotes/${q.id}/items`]),
    ...[...programsByClient.values()].flatMap((programs) => (Array.isArray(programs) ? programs : [])).map((p) => [`/programs/${p.id}/schedule`]),
  ];
  await runAll(pages);
  return { ...state, aborted: state.aborted || Boolean(signal?.aborted) };
}
