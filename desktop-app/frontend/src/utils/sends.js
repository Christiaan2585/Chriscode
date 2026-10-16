// The wording for the sent history (pure; the network part is in useSends.js).
import { currentLanguage } from "./i18n.js";

// "treatments" = the plain message of coming program dates (no document).
const WAYS = {
  en: { whatsapp: "on WhatsApp", email: "by email", "app-email": "by email" },
  af: { whatsapp: "per WhatsApp", email: "per e-pos", "app-email": "per e-pos" },
};

// Which kind of send a preview is recorded as (the server's list in app/api/sends.py); null = not recorded.
export const sendKindOf = (doc) => {
  if (doc?.send?.sendKind) return doc.send.sendKind;
  return { quote: "quote", invoice: "invoice", statement: "statement", program: "program", "program-costs": "program-costs", catalogue: "order-form" }[doc?.kind] || null;
};

// What to show beside a document that has been sent: { short: "Sent by email · 16 Oct", long: "...on 16 October 2026 by Sarah" }.
export function describeSend(entry, kind = "", lang = currentLanguage) {
  if (!entry) return null;
  const af = lang === "af";
  const locale = af ? "af-ZA" : "en-ZA";
  const way = WAYS[af ? "af" : "en"][entry.via] || "";
  const lead = kind === "reminder" ? (af ? "Herinnering gestuur" : "Reminder sent") : (af ? "Gestuur" : "Sent");
  const when = new Date(entry.at);
  const short = `${lead} ${way} · ${when.toLocaleDateString(locale, { day: "numeric", month: "short" })}`;
  const to = entry.to ? ` ${af ? "aan" : "to"} ${entry.to}` : "";
  const by = entry.by ? ` ${af ? "deur" : "by"} ${entry.by}` : "";
  const day = when.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  return { short, long: `${lead} ${way}${to} ${af ? "op" : "on"} ${day}${by}` };
}
