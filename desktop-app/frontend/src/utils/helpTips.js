// The Help button: a short tip for the page you are on, and the details to send when you ask for help.

const TIPS = [
  ["/clients/", "A client's page holds their animals, programs, quotes, invoices, photos and notes. Log a call under Notes so everyone knows what was said."],
  ["/clients", "Add a client with the button at the top. Type a name or phone number in the search box to find one fast; the list remembers your filters."],
  ["/programs", "Programs & Quotes: a herding program is also its quote. Mark the quote Accepted to lock the amounts and start invoicing each date."],
  ["/invoices", "Press the tick on an invoice to mark it paid. The bell sends a payment reminder; \"Remind all overdue\" sends them all at once."],
  ["/products", "Click any price or name to edit it in place. Count your stock once and the app keeps the number up to date."],
  ["/orders", "Orders from clients wait here until you turn them into an invoice."],
  ["/purchase-orders", "Quick order builds a purchase order for everything that is running low. The Stock tab shows what moved and why."],
  ["/calendar", "Visits and program dates appear here. Click a day to see the details."],
  ["/reports", "Statements show what a client owes; aged debtors shows who is late and by how much."],
  ["/setup", "The set-up guide walks through the settings that matter. Skip any step and come back later; each step is the real settings screen."],
  ["/settings", "Settings: your details, company banking, email, staff accounts, backups and the wording of messages to clients."],
  ["/weather", "Frost, heat, rain and wind alerts for your location, from the free Open-Meteo service."],
  ["/", "The dashboard shows what needs you today: overdue invoices, treatments due and quotes waiting for an answer."],
];

export function tipFor(pathname) {
  const path = pathname || "/";
  const hit = TIPS.find(([prefix]) => (prefix === "/" ? path === "/" : prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(prefix + "/")));
  return hit ? hit[1] : "Use the search box at the top to find a client, product or invoice quickly.";
}

// Plain text to paste into an email or message when asking for help. No personal data: no client names, only the
// page's path with ids kept out, the version and the signed-in person's own name.
export function supportDetails({ pathname, version, userName, language, when = new Date() }) {
  const safePath = (pathname || "/").replace(/\/\d+/g, "/#");
  return [
    "Sandveld Vee Dienste - help request",
    `Page: ${safePath}`,
    `Version: ${version || "unknown"}`,
    `Signed in as: ${userName || "unknown"}`,
    `Language: ${language || "en"}`,
    `Time: ${when.toISOString()}`,
  ].join("\n");
}
