export const money = (n) =>
  `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Newest first, as Sage lists documents.
export const newestFirst = (a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id;

// A client is a farm: show the farm's name, and the contact's own name when there is no farm name.
export const farmLabel = (client) => client?.farm_name || client?.name || "";

export const shortDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

// Invoice statuses are lowercase, quote/order statuses capitalised.
const STATUS_STYLES = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-blue-100 text-blue-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Shipped: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700",
  unpaid: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
};
export const statusStyle = (s) => STATUS_STYLES[s] || "bg-slate-100 text-slate-700";
