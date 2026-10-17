// "Check before sending": what is wrong with a document about to go to a client, found before it is sent so the
// person can fix it (or send anyway). Pure; shown by components/SendChecks.jsx above the send buttons.
//
//   sendChecks({ kind, client, doc, via, today })  ->  [{ level: "warn" | "info", text }]
// `via` is "email" | "whatsapp" | "app-email" (anything else: no contact check). `doc` may carry total_amount,
// expiry_date (quotes) and status.

const dayOf = (value) => (value ? String(value).slice(0, 10) : "");

export function sendChecks({ kind, client, doc, via, today = new Date().toISOString().slice(0, 10) }) {
  const out = [];
  const emailVia = via === "email" || via === "app-email";
  if (emailVia && !(client?.email || "").trim()) out.push({ level: "warn", text: "This client has no email address on file." });
  if (via === "whatsapp" && !(client?.phone || "").trim()) out.push({ level: "warn", text: "This client has no phone number on file." });
  if (doc) {
    const total = Number(doc.total_amount);
    if ((kind === "quote" || kind === "invoice") && Number.isFinite(total) && total <= 0) {
      out.push({ level: "warn", text: `This ${kind} has no amount (R0.00). Is it missing its lines?` });
    }
    if (kind === "quote" && doc.expiry_date && dayOf(doc.expiry_date) < today) {
      out.push({ level: "warn", text: "This quote has already expired. The prices may be out of date." });
    }
    if (kind === "invoice" && doc.status === "paid") out.push({ level: "info", text: "This invoice is already paid." });
    if (doc.status === "cancelled") out.push({ level: "warn", text: `This ${kind} is cancelled.` });
  }
  return out;
}

export const hasWarnings = (checks) => checks.some((c) => c.level === "warn");
