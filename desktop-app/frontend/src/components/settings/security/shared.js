export const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
export const primary = "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50";
export const secondary = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const detailOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : detail?.message || fallback;
};
