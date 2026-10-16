// The wording for the sent history (pure; the network part is in useSends.js).

// "treatments" = the plain message of coming program dates (no document).
const WAYS = { whatsapp: "on WhatsApp", email: "by email", "app-email": "by email" };

// Which kind of send a preview is recorded as (the server's list in app/api/sends.py); null = not recorded.
export const sendKindOf = (doc) => {
  if (doc?.send?.sendKind) return doc.send.sendKind;
  return { quote: "quote", invoice: "invoice", statement: "statement", program: "program", "program-costs": "program-costs", catalogue: "order-form" }[doc?.kind] || null;
};

// What to show beside a document that has been sent: { short: "Sent by email · 16 Oct", long: "...on 16 October 2026 by Sarah" }.
export function describeSend(entry, kind = "") {
  if (!entry) return null;
  const way = WAYS[entry.via] || "";
  const lead = kind === "reminder" ? "Reminder sent" : "Sent";
  const when = new Date(entry.at);
  const short = `${lead} ${way} · ${when.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`;
  const to = entry.to ? ` to ${entry.to}` : "";
  const by = entry.by ? ` by ${entry.by}` : "";
  return { short, long: `${lead} ${way}${to} on ${when.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}${by}` };
}
