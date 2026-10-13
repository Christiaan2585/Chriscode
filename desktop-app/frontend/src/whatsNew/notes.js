// What changed, in plain words, for the one-time "What's new" window after an update (components/WhatsNew.jsx).
// Add an entry for every release - `version` must match version.json - newest first. Keep it short and about what
// people will notice. (Never put the business's program steps, products or doses here: the repository is public.)
export const NOTES = [
  {
    version: "1.0.13",
    title: "Brochures, and finding clients by town and herd size",
    sections: [
      {
        heading: "New",
        items: [
          "Brochures: add a PDF brochure (Products > Brochures & catalogues) and send it to as many clients as you tick - by email in one click (each client gets their own name in the greeting), or by WhatsApp one client at a time. The list shows who already got it.",
          "Add the brochure's products to your products list: open its pages, draw a box round a product and the picture snaps to the product's own outline. Type the name and price and it is added with that picture.",
          "Clients: filter by town or area and by the number of animals, and sort by name, most or fewest animals, or town. Each client now has a Town / area field (it can also be imported from a spreadsheet).",
        ],
      },
    ],
  },
  {
    version: "1.0.12",
    title: "Money, reports, stock and email",
    sections: [
      {
        heading: "New",
        items: [
          "Payments and credit notes on every invoice (the wallet button): the invoice shows what is still owed and marks itself paid. Credit notes are numbered CRN and print as a PDF.",
          "A Reports page: who owes you money (by how late it is), a statement for any client that you can send by WhatsApp or email, and an Excel file for your accountant with invoices, payments, credit notes and VAT per month. Each client's page has a Statement button too.",
          "Stock counts: type the number you have in the new Stock column on the Products page. Invoices take stock off, received purchase orders add to it, and the dashboard warns when something is at its reorder level.",
          "Email straight from the app: an admin sets up your email account once (Settings > Email); then every document preview has Send from app, with the PDF attached.",
          "A daily reminder in Windows about overdue or due-this-week treatments, scans and unpaid invoices (switch it off in Settings > Security).",
          "A recycle bin: what an admin deletes is kept for 30 days and can be put back with everything that went with it (Settings > Recycle bin).",
        ],
      },
      {
        heading: "Smaller and safer",
        items: [
          "The installer is smaller and imports are safer: very large spreadsheets are refused. Old .xls files must be saved as .xlsx first.",
        ],
      },
    ],
  },
  {
    version: "1.0.10",
    title: "A calmer look, safer sign-in and the phone works offline",
    sections: [
      {
        heading: "New",
        items: [
          "Five colour schemes taken from the farm (Settings > General > Appearance), easier on the eyes in light and dark.",
          "Your name and phone number show under the logo as the sales rep; Lock and Sign out are now in Settings > My Details.",
          "Ram ear-tag numbers on each client's page, and the top search finds a ram by its tag.",
          "A new header animation: sheep, cow, collie and a Land Cruiser bakkie.",
          "Android: the phone keeps a copy of the office data, works without the office Wi-Fi, and catches up when it is back.",
          "Android: the phone app can now update itself - it checks the same releases as the PC and asks before installing (Settings > General > Software Update).",
        ],
      },
      {
        heading: "Safer",
        items: [
          "Only admins can delete clients, invoices, quotes, orders, products and programs.",
          "Wrong-password guessing is limited properly, and a temporary password can only be used to choose a new one.",
          "The \"remember this device\" sign-in is locked with Windows' own encryption.",
          "A phone not used for 90 days has to be paired again.",
          "The phone's offline copy of your data is now encrypted, and so are the two-step sign-in keys on the PC.",
        ],
      },
      {
        heading: "Tidier",
        items: ["A smaller installer, and a few old features nothing used were removed."],
      },
    ],
  },
];
