// What goes with a quote or herding program sent to a client (utils/sending.js).
// `what` is the document's name in the sentence, `number` its quote number if any.
const clientSend = (client, subject, what, number) => ({
  phone: client?.phone,
  email: client?.email,
  subject: number ? `${subject} ${number}` : subject,
  message: `Good day ${client?.name || ""}, please find your ${what}${number ? ` (${number})` : ""} attached. Please let us know if you have any questions. Thank you!`,
});

// A quote ready to send: the preview's WhatsApp / Email buttons need `send`.
// `onSent` runs once it has gone (the quote becomes "Sent", see documents.js markQuoteSent).
export const quoteDoc = (quote, client, onSent) => ({
  kind: "quote",
  id: quote.id,
  title: quote.number,
  send: { ...clientSend(client, "Your quote", "quote", quote.number), onSent },
});

// An invoice ready to send. Invoices have no "Sent" status, so nothing changes once it has gone.
export const invoiceDoc = (invoice, client) => ({
  kind: "invoice",
  id: invoice.id,
  title: invoice.number,
  send: {
    ...clientSend(client, "Your invoice", "invoice", invoice.number),
    message: `Good day ${client?.name || ""}, please find your invoice${invoice.number ? ` (${invoice.number})` : ""} attached. The payment details are on the invoice. Thank you!`,
  },
});

// The herding program sheet (kind "program") or its costs (kind "program-costs") for a client.
export const programSend = (client, costs) =>
  clientSend(client, costs ? "Your herding program costs" : "Your herding program", costs ? "herding program costs" : "herding program");
