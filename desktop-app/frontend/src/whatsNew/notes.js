// What changed, in plain words, for the one-time "What's new" window after an update (components/WhatsNew.jsx).
// Add an entry for every release - `version` must match version.json - newest first. Keep it short and about what
// people will notice. (Never put the business's program steps, products or doses here: the repository is public.)
export const NOTES = [
  {
    version: "1.0.21",
    title: "Sign in with Google, made easy",
    sections: [
      {
        heading: "New",
        items: [
          "Settings now has a Sign in with Google page for admins: three buttons open the right Google pages, then you choose the file Google gives you (or paste what it shows) and switch it on. No more editing files by hand, and no restart.",
          "If Google sign-in fails, the message now says what to do about it.",
        ],
      },
    ],
  },
  {
    version: "1.0.20",
    title: "Quicker everyday work",
    sections: [
      {
        heading: "New",
        items: [
          "A + New button in the top bar: make a client, quote, invoice, payment or visit from any screen.",
          "A Help button (?) with a tip for the page you are on, a set-up guide that walks you through the settings, and a way to copy details when you ask for help.",
          "Remind all overdue: send a payment reminder, with the invoice attached, to every overdue client in one go.",
          "Paid in full with one tap (cash or EFT), and Record a payment from anywhere.",
          "Warnings before you slip up: a client that looks like one you already have, selling more than the stock on the shelf, and a check before sending (no email address, an expired quote, an R0 invoice).",
          "Log phone calls on a client's page, with who made the call and when.",
          "Today on the dashboard: invoices made, money received, things sent, and what is still waiting. Admins also see who did what.",
          "Limited staff: choose people who can do the daily work but cannot see cost prices or the money reports (Settings, Security).",
          "Phone: photos taken with no signal are kept and added when the office PC can be reached, and long-pressing the app icon gives New client, New invoice and New quote.",
          "Updates now install by themselves and the app reopens, with no installer screens.",
        ],
      },
    ],
  },
  {
    version: "1.0.19",
    title: "Easier every day",
    sections: [
      {
        heading: "New",
        items: [
          "The whole app can be shown in Afrikaans (Settings, General, Language), with bigger text and a high-contrast option for easier reading.",
          "Mark an invoice as paid in one click, turn a quote into an invoice, or repeat an earlier invoice.",
          "Add a new client right from the invoice or quote form, and your recent picks come first.",
          "Delete something by mistake? An Undo button appears straight away. Half-finished invoices and quotes are saved as drafts.",
          "Photos on a client's page, and call and WhatsApp buttons next to client names.",
          "Import files are checked first, so you see what will happen before anything is saved.",
          "You can change the wording of the messages sent to clients (Settings, Messages).",
          "A Getting started checklist on the dashboard, a backup warning if backups are old, and a weekly summary notification.",
          "On a phone there is now a bottom bar for the main screens.",
        ],
      },
    ],
  },
  {
    version: "1.0.18",
    title: "Faster, and easier to keep in touch with clients",
    sections: [
      {
        heading: "Faster",
        items: [
          "The app opens about a third quicker, and the window shows straight away while it gets ready.",
          "Screens load their data faster, and long lists (hundreds of invoices or clients) show 100 at a time with Show more, so they no longer slow down.",
        ],
      },
      {
        heading: "New",
        items: [
          "Send invoices, quotes and herding programs to a client by WhatsApp or email, and see at a glance what was sent and when (a small \"Sent by email\" note under each one).",
          "Payment reminders: a bell button on every overdue invoice sends a friendly reminder with the invoice attached.",
          "Month-end statements: on the Reports page, email a statement to everyone who owes money in one go.",
          "Remind of dates: on a client's page, send the farmer their coming herding program dates.",
          "Each client can be set to English or Afrikaans, and everything the app sends them is written in that language.",
          "Settings now shows an amber badge when something still needs filling in, instead of a pop-up every time the app opens.",
          "Setting up email is much easier: pick Gmail, Outlook or Yahoo, type your address and password, and the app tests it for you.",
        ],
      },
    ],
  },
  {
    version: "1.0.17",
    title: "Send invoices, and quotes that turn to Sent",
    sections: [
      {
        heading: "New",
        items: [
          "Send an invoice to a client by WhatsApp or email: open the invoice's preview (Invoices page or the client's page) and use the WhatsApp, Email or Send from app buttons.",
          "A Draft quote becomes Sent as soon as you send it to the client. A herding program's quote does the same.",
        ],
      },
    ],
  },
  {
    version: "1.0.16",
    title: "Send quotes and herding programs",
    sections: [
      {
        heading: "New",
        items: [
          "Send a quote to a client by WhatsApp or email: open the quote's preview (Quotes page, the client's page or the herding program page) and use the WhatsApp, Email or Send from app buttons.",
          "The same buttons are on a herding program's Program PDF and Costs PDF, so you can send the program or its costs straight to the farmer.",
        ],
      },
    ],
  },
  {
    version: "1.0.15",
    title: "Connect from anywhere",
    sections: [
      {
        heading: "New",
        items: [
          "Connect from anywhere: switch it on under Settings > Phones on the office PC and phones reach the PC from any Wi-Fi or mobile data, even when the office Wi-Fi will not let them connect directly. Nothing to install and no router settings. Everything stays encrypted between the phone and the PC.",
          "Phones that are already paired pick this up by themselves the next time they connect at the office. Check connection on the phone now shows the Wi-Fi and the relay side by side and says what is wrong in plain words.",
          "\"Make a new key for phones\" stops a removed or lost phone from using the relay.",
        ],
      },
    ],
  },
  {
    version: "1.0.14",
    title: "Phones that keep finding the office PC",
    sections: [
      {
        heading: "New",
        items: [
          "While it is connected, the phone now asks the office PC for its current addresses and keeps them, so a new address from the router - or Tailscale installed on the PC later - reaches the phone by itself, with no pairing again.",
          "Settings > Phones on the PC now says whether Tailscale is installed and connected, and links to the download. With Tailscale on the PC and the phone, the phone connects from anywhere, even when the office Wi-Fi will not let it reach the PC.",
          "The phone's Check connection also tells you when Tailscale is off on the phone or still missing on the PC.",
        ],
      },
    ],
  },
  {
    version: "1.0.13",
    title: "Brochures, and finding clients by town and herd size",
    sections: [
      {
        heading: "New",
        items: [
          "Brochures: add a PDF brochure (Products > Brochures & catalogues) and send it to as many clients as you tick - by email in one click (each client gets their own name in the greeting), or by WhatsApp one client at a time. The list shows who already got it.",
          "Add the brochure's products to your products list: open its pages, draw a box round a product and the picture snaps to the product's own outline. Type the name and price and it is added with that picture.",
          "A steadier phone connection: the phone remembers every address of the office PC and switches by itself, finds the PC again on the Wi-Fi if its address changed, and Settings > Phones on the phone has a Check connection button that says what is wrong. On the PC, Settings > Phones has Always ready for phones: the app stays running in the tray when you close the window, can start with Windows and can keep the PC awake.",
          "Quick order (Purchase Orders page): pick the supplier and everything that is low or out of stock is already filled in with an amount to order. Change what you like, press Create, and the order opens ready to send to the supplier by WhatsApp or email with the list in the message. Each product remembers its usual supplier.",
          "Stock menu on the Purchase Orders page: what is on the shelf (count it once, then it keeps itself up to date), what is low or out, adjustments for breakage or samples, and a timeline of every change - sold on an invoice, received on a purchase order, counted or adjusted - with what was left after each. Invoices take stock off automatically and a purchase order adds it when marked Received.",
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
