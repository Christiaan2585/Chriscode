// What goes with a quote, invoice, statement, reminder or herding program sent to a client (utils/sending.js), in the
// client's own language: "af" (Afrikaans) if their record says so, English otherwise. All the wording is in WORDS.
// Pure: no imports, so it can be tested on its own (clientSend.test.mjs).

export const languageOf = (client) => (client?.language === "af" ? "af" : "en");

const WORDS = {
  en: {
    hello: (name) => `Good day ${name},`,
    quote: { subject: "Your quote", what: "quote", end: "Please let us know if you have any questions. Thank you!" },
    invoice: { subject: "Your invoice", what: "invoice", end: "The payment details are on the invoice. Thank you!" },
    program: { subject: "Your herding program", what: "herding program" },
    costs: { subject: "Your herding program costs", what: "herding program costs" },
    attached: "attached.",
    questions: "Please let us know if you have any questions. Thank you!",
    statement: { subject: "Your statement of account", message: "please find your statement of account attached. Thank you!" },
    reminderSubject: (n) => `Payment reminder - invoice ${n}`,
    reminder: (n, amount, due) =>
      `a friendly reminder that invoice ${n} for ${amount} ${due ? `was due on ${due}` : "is overdue"}. If you have already paid, please ignore this message and thank you. The invoice is attached.`,
    treatments: { subject: "Your herding program dates", intro: "a reminder of your coming herding program dates:", end: "Please let us know if you need anything. Thank you!" },
    locale: "en-ZA",
  },
  af: {
    hello: (name) => `Goeie dag ${name},`,
    quote: { subject: "U kwotasie", what: "kwotasie", end: "Laat ons asseblief weet as u enige vrae het. Dankie!" },
    invoice: { subject: "U faktuur", what: "faktuur", end: "Die betalingsbesonderhede is op die faktuur. Dankie!" },
    program: { subject: "U kuddeprogram", what: "kuddeprogram" },
    costs: { subject: "U kuddeprogram se koste", what: "kuddeprogram se koste" },
    attached: "aangeheg.",
    questions: "Laat ons asseblief weet as u enige vrae het. Dankie!",
    statement: { subject: "U rekeningstaat", message: "hier is u rekeningstaat aangeheg. Dankie!" },
    reminderSubject: (n) => `Betalingsherinnering - faktuur ${n}`,
    reminder: (n, amount, due) =>
      `'n vriendelike herinnering dat faktuur ${n} vir ${amount} ${due ? `op ${due} verskuldig was` : "agterstallig is"}. Indien u reeds betaal het, ignoreer asseblief hierdie boodskap en dankie. Die faktuur is aangeheg.`,
    treatments: { subject: "U kuddeprogram se datums", intro: "'n herinnering van u kuddeprogram se komende datums:", end: "Laat weet ons gerus as u iets nodig het. Dankie!" },
    locale: "af-ZA",
  },
};

const wordsFor = (client) => WORDS[languageOf(client)];
const dateText = (value, locale, withYear) =>
  new Date(value).toLocaleDateString(locale, { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) });

const contact = (client) => ({ phone: client?.phone, email: client?.email, clientId: client?.id });

// "Good day Piet, please find your quote (QUO0000007) attached. <ending>"
const documentMessage = (client, w, kind, number) =>
  `${w.hello(client?.name || "")} ${w === WORDS.af ? "hier is u" : "please find your"} ${kind.what}${number ? ` (${number})` : ""} ${w.attached} ${kind.end || w.questions}`;

// A quote ready to send: the preview's WhatsApp / Email buttons need `send`.
// `onSent` runs once it has gone (the quote becomes "Sent", see documents.js markQuoteSent).
export const quoteDoc = (quote, client, onSent) => {
  const w = wordsFor(client);
  return {
    kind: "quote",
    id: quote.id,
    title: quote.number,
    send: { ...contact(client), subject: quote.number ? `${w.quote.subject} ${quote.number}` : w.quote.subject, message: documentMessage(client, w, w.quote, quote.number), onSent },
  };
};

// An invoice ready to send. Invoices have no "Sent" status, so nothing changes once it has gone.
export const invoiceDoc = (invoice, client) => {
  const w = wordsFor(client);
  return {
    kind: "invoice",
    id: invoice.id,
    title: invoice.number,
    send: { ...contact(client), subject: invoice.number ? `${w.invoice.subject} ${invoice.number}` : w.invoice.subject, message: documentMessage(client, w, w.invoice, invoice.number) },
  };
};

// A friendly payment reminder for an overdue invoice: the invoice goes with it. `amountText` is what is still owed,
// already formatted; `dueDate` is the invoice's due date (optional).
export const reminderDoc = (invoice, client, { amountText, dueDate } = {}) => {
  const w = wordsFor(client);
  const due = dueDate ? dateText(dueDate, w.locale, true) : null;
  return {
    kind: "invoice",
    id: invoice.id,
    title: invoice.number,
    send: {
      ...contact(client),
      sendKind: "reminder", // recorded in the sent history as a reminder, not as the invoice itself
      subject: w.reminderSubject(invoice.number || `#${invoice.id}`),
      message: `${w.hello(client?.name || "")} ${w.reminder(invoice.number || `#${invoice.id}`, amountText, due)}`,
    },
  };
};

// The herding program sheet (kind "program") or its costs (kind "program-costs") for a client.
export const programSend = (client, costs) => {
  const w = wordsFor(client);
  const kind = costs ? w.costs : w.program;
  return { ...contact(client), subject: kind.subject, message: documentMessage(client, w, kind) };
};

// The words that go with a statement of account (documents.js statementFor).
export const statementMessage = (client) => {
  const w = wordsFor(client);
  return { subject: w.statement.subject, message: `${w.hello(client?.name || "")} ${w.statement.message}` };
};

// The farm's coming herding program dates as a plain message (no file): `items` = [{ date, label }], soonest first.
// null when there is nothing to say.
export const treatmentMessage = (client, items) => {
  if (!items?.length) return null;
  const w = wordsFor(client);
  const lines = items.map((item) => `- ${dateText(item.date, w.locale, false)}: ${item.label}`).join("\n");
  return {
    subject: w.treatments.subject,
    message: `${w.hello(client?.name || "")} ${w.treatments.intro}\n${lines}\n${w.treatments.end}`,
  };
};
