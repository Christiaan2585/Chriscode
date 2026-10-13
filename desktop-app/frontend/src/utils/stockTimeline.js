// Wording and grouping for the Stock timeline (components/StockPanel.jsx). Rows come from GET /stock/movements.
const DOC = { sold: ["invoice", "an invoice"], received: ["purchase order", "a purchase order"] };

export function describeMovement(m) {
  if (m.reason === "count") return m.note ? `Counted - ${m.note}` : "Counted";
  if (m.reason === "adjusted") return m.note ? `Adjusted - ${m.note}` : "Adjusted";
  const [name, generic] = DOC[m.reason] || ["document", "a document"];
  const verb = m.reason === "sold" ? "Sold" : "Received";
  // A document that was edited, cancelled or deleted books the difference, which can point the other way.
  const reversed = m.reason === "sold" ? m.change > 0 : m.change < 0;
  if (reversed) return `${m.reason === "sold" ? "Sale" : "Delivery"} corrected (${name}${m.reference ? ` ${m.reference}` : ""})`;
  return m.reference ? `${verb} on ${name} ${m.reference}` : `${verb} on ${generic}`;
}

export function groupByDay(rows) {
  const groups = [];
  for (const row of rows) {
    const day = String(row.at).slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}

export const statusLabel = (status) => ({ ok: "OK", low: "Low", out: "Out of stock", untracked: "Not counted yet" }[status] || status);
