// An invoice is overdue when it is unpaid, money is still owing and its due date is before today.
// `entry` is that invoice's { balance } from GET /payments/balances.
export function isOverdue(invoice, entry, today = new Date()) {
  if (invoice?.status !== "unpaid" || !invoice.due_date || !((entry?.balance ?? 0) > 0)) return false;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(invoice.due_date) < startOfToday;
}
