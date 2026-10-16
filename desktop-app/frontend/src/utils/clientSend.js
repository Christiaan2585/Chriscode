// What goes with a quote, invoice, statement, reminder or herding program sent to a client (utils/sending.js), in the
// client's own language: "af" (Afrikaans) if their record says so, English otherwise.
//
// Every message is a template (subject + body) with {placeholders}. The standard wording is DEFAULTS below; the
// business can change any of it under Settings -> Messages to clients (the overrides are loaded once by
// components/MessageTemplatesLoader.jsx via setMessageTemplates). The bulk statements are written on the server
// (app/core/statement_mail.py) from the same overrides - keep the two standard texts in step.
// Pure: no imports, so it can be tested on its own (clientSend.test.mjs).

export const languageOf = (client) => (client?.language === "af" ? "af" : "en");

export const DEFAULTS = {
  en: {
    quote: { subject: "Your quote {number}", body: "Good day {name}, please find your quote ({number}) attached. Please let us know if you have any questions. Thank you!" },
    invoice: { subject: "Your invoice {number}", body: "Good day {name}, please find your invoice ({number}) attached. The payment details are on the invoice. Thank you!" },
    reminder: { subject: "Payment reminder - invoice {number}", body: "Good day {name}, a friendly reminder that invoice {number} for {amount} {dueClause}. If you have already paid, please ignore this message and thank you. The invoice is attached." },
    statement: { subject: "Your statement of account", body: "Good day {name}, please find your statement of account attached. Thank you!" },
    program: { subject: "Your herding program", body: "Good day {name}, please find your herding program attached. Please let us know if you have any questions. Thank you!" },
    costs: { subject: "Your herding program costs", body: "Good day {name}, please find your herding program costs attached. Please let us know if you have any questions. Thank you!" },
    treatments: { subject: "Your herding program dates", body: "Good day {name}, a reminder of your coming herding program dates:\n{dates}\nPlease let us know if you need anything. Thank you!" },
  },
  af: {
    quote: { subject: "U kwotasie {number}", body: "Goeie dag {name}, hier is u kwotasie ({number}) aangeheg. Laat ons asseblief weet as u enige vrae het. Dankie!" },
    invoice: { subject: "U faktuur {number}", body: "Goeie dag {name}, hier is u faktuur ({number}) aangeheg. Die betalingsbesonderhede is op die faktuur. Dankie!" },
    reminder: { subject: "Betalingsherinnering - faktuur {number}", body: "Goeie dag {name}, 'n vriendelike herinnering dat faktuur {number} vir {amount} {dueClause}. Indien u reeds betaal het, ignoreer asseblief hierdie boodskap en dankie. Die faktuur is aangeheg." },
    statement: { subject: "U rekeningstaat", body: "Goeie dag {name}, hier is u rekeningstaat aangeheg. Dankie!" },
    program: { subject: "U kuddeprogram", body: "Goeie dag {name}, hier is u kuddeprogram aangeheg. Laat ons asseblief weet as u enige vrae het. Dankie!" },
    costs: { subject: "U kuddeprogram se koste", body: "Goeie dag {name}, hier is u kuddeprogram se koste aangeheg. Laat ons asseblief weet as u enige vrae het. Dankie!" },
    treatments: { subject: "U kuddeprogram se datums", body: "Goeie dag {name}, 'n herinnering van u kuddeprogram se komende datums:\n{dates}\nLaat weet ons gerus as u iets nodig het. Dankie!" },
  },
};

// What the settings screen shows for each message: its name and the placeholders it understands.
export const MESSAGE_KINDS = [
  { id: "quote", label: "Quote", placeholders: ["name", "number"] },
  { id: "invoice", label: "Invoice", placeholders: ["name", "number"] },
  { id: "reminder", label: "Payment reminder", placeholders: ["name", "number", "amount", "dueClause"] },
  { id: "statement", label: "Statement of account", placeholders: ["name"] },
  { id: "program", label: "Herding program", placeholders: ["name"] },
  { id: "costs", label: "Herding program costs", placeholders: ["name"] },
  { id: "treatments", label: "Remind of dates", placeholders: ["name", "dates"] },
];

const LOCALES = { en: "en-ZA", af: "af-ZA" };

// The business's own wording: { en: { quote: { subject, body } }, af: {...} } - only what it changed.
let overrides = {};
export const setMessageTemplates = (templates) => {
  overrides = templates && typeof templates === "object" ? templates : {};
};

// {name}-style placeholders that are in `values` are replaced; anything else in braces stays. Empty brackets left by a
// missing value (a quote with no number) vanish.
export function fill(text, values) {
  let out = text;
  for (const [key, value] of Object.entries(values)) out = out.split(`{${key}}`).join(String(value ?? ""));
  return out.replace(/[ \t]*\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

const render = (client, kind, values) => {
  const lang = languageOf(client);
  const standard = DEFAULTS[lang][kind];
  const own = overrides?.[lang]?.[kind] || {};
  const all = { name: client?.name || "", ...values };
  return { subject: fill(own.subject || standard.subject, all), message: fill(own.body || standard.body, all) };
};

const contact = (client) => ({ phone: client?.phone, email: client?.email, clientId: client?.id });
const dateText = (value, lang, withYear) =>
  new Date(value).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) });

// A quote ready to send: the preview's WhatsApp / Email buttons need `send`.
// `onSent` runs once it has gone (the quote becomes "Sent", see documents.js markQuoteSent).
export const quoteDoc = (quote, client, onSent) => ({
  kind: "quote",
  id: quote.id,
  title: quote.number,
  send: { ...contact(client), ...render(client, "quote", { number: quote.number || "" }), onSent },
});

// An invoice ready to send. Invoices have no "Sent" status, so nothing changes once it has gone.
export const invoiceDoc = (invoice, client) => ({
  kind: "invoice",
  id: invoice.id,
  title: invoice.number,
  send: { ...contact(client), ...render(client, "invoice", { number: invoice.number || "" }) },
});

// A friendly payment reminder for an overdue invoice: the invoice goes with it. `amountText` is what is still owed,
// already formatted; `dueDate` is the invoice's due date (optional).
export const reminderDoc = (invoice, client, { amountText, dueDate } = {}) => {
  const lang = languageOf(client);
  const due = dueDate ? dateText(dueDate, lang, true) : null;
  const dueClause = lang === "af" ? (due ? `op ${due} verskuldig was` : "agterstallig is") : (due ? `was due on ${due}` : "is overdue");
  return {
    kind: "invoice",
    id: invoice.id,
    title: invoice.number,
    send: {
      ...contact(client),
      sendKind: "reminder", // recorded in the sent history as a reminder, not as the invoice itself
      ...render(client, "reminder", { number: invoice.number || `#${invoice.id}`, amount: amountText || "", dueClause }),
    },
  };
};

// The herding program sheet (kind "program") or its costs (kind "program-costs") for a client.
export const programSend = (client, costs) => ({ ...contact(client), ...render(client, costs ? "costs" : "program", {}) });

// The words that go with a statement of account (documents.js statementFor).
export const statementMessage = (client) => render(client, "statement", {});

// The farm's coming herding program dates as a plain message (no file): `items` = [{ date, label }], soonest first.
// null when there is nothing to say.
export const treatmentMessage = (client, items) => {
  if (!items?.length) return null;
  const lang = languageOf(client);
  const dates = items.map((item) => `- ${dateText(item.date, lang, false)}: ${item.label}`).join("\n");
  return render(client, "treatments", { dates });
};

// A message as it will read, with made-up values, for the settings screen. `template` (optional) = { subject, body }
// being edited, instead of what is saved.
export function previewMessage(kind, lang, template) {
  const standard = DEFAULTS[lang][kind];
  const subject = template?.subject || overrides?.[lang]?.[kind]?.subject || standard.subject;
  const body = template?.body || overrides?.[lang]?.[kind]?.body || standard.body;
  const sample = {
    name: "Piet", number: kind === "quote" ? "QUO0000007" : "INV0000182", amount: "R 1 200,00",
    dueClause: lang === "af" ? "op 30 September 2026 verskuldig was" : "was due on 30 September 2026",
    dates: `- ${dateText("2026-11-01T00:00:00", lang, false)}: ${lang === "af" ? "Eerste inenting" : "First vaccination"}\n- ${dateText("2026-11-09T00:00:00", lang, false)}: ${lang === "af" ? "Dosering" : "Dosing"}`,
  };
  return { subject: fill(subject, sample), message: fill(body, sample) };
}
