# Changelog

All notable changes to Sandveld Vee Dienste. Newest first.

## 1.0.9 - 2026-10-07

### Security
- **Five wrong tries, then locked**: a password (or PIN, or two-step code) tried wrongly 5 times locks that account for 15 minutes; each further lock is longer (1 hour, 4 hours, 24 hours). The sign-in screen counts down the tries left. Admins can unlock a person under Settings -> Security.
- **Strong passwords**: at least 10 characters, no common or repeated passwords, nothing based on your name or email. An admin's password reset makes the person choose their own on next sign-in.
- **Two-step sign-in** (authenticator app) per person, with recovery codes. **Sign out everywhere** signs an account out on every PC and phone; admins can do it for a staff member. Phone sessions are shorter (6 hours, 14 days remembered).
- **Activity log** (Settings -> Activity log, admins): who signed in, failed tries, and every change - what, who, when, PC or phone. No passwords or amounts. Kept a year.
- **Lock backups with a passphrase** (AES-256): locked backups are unreadable without it. This PC remembers the passphrase (Windows DPAPI) for the daily backups. Backups made before locking stay as they were.
- **Only the Sandveld app can use its own backend**: the desktop app and its backend share a secret made on each launch, so other programs on the PC can no longer talk to it; only one copy of the app can run.
- **Easier to see and use on a phone (and a narrow window)**: lists - clients, products, invoices, quotes, orders, purchase orders - show as one card per item instead of a table that scrolls sideways: the main detail as a heading, each other detail labelled, and big buttons (view, download, edit, call, WhatsApp, delete). Products have picture cards with larger names and prices, category buttons you can swipe through, and bigger buttons; forms stack in one column; the search box fits.
- **Phone polish found by testing on a real phone**: the PIN screen no longer pops the phone's keyboard over the keypad; the quote, invoice and purchase-order line rows fit the screen with labelled Qty / Price / Discount; a "1 waiting" badge in the top bar shows changes saved on the phone while the office PC could not be reached (they were checked going through once the PC is back, with no duplicates).
- **Fixes found while checking the Android app**: the phone now talks to the office PC through its own secure connection (the phone's web view refused the PC's certificate, so the app could not have connected); PDFs open in the phone's PDF app or the share sheet (WhatsApp, email, print) instead of a blank frame. Google sign-in no longer skips two-step sign-in or the account lock, and an admin cannot reset their own password or two-step without proof (current password / code).
- **Android**: the phone's access key is kept in the Android Keystore, the app is excluded from Android backups, and screenshots/recent-apps previews are blocked.
- **Client privacy tools** (admins, on the client's page): export everything kept about a client, or erase their personal details (invoices, quotes and orders are kept as accounting records).
- **Security check on every build** (`security-check.bat`: pip-audit and npm audit); updated react-router to fix reported vulnerabilities.
- Settings -> Security has a checklist of the things only you can switch on (BitLocker, GitHub two-step, code signing).

## 1.0.8 - 2026-10-07 (includes everything planned for 1.0.7, which was never released)

### New
- **Android app (first version)**: the same app on staff phones, connected to the office PC over the Wi-Fi. Pair a phone under Settings -> Phones on the PC; the phone asks before pairing and only pairs with an office-network address. Ticking program steps and new quotes are kept on the phone while it's away from the office Wi-Fi, and sent when it's back.
- **Scan the pairing QR with the phone's camera** (Android 1.0.8.1): a Scan QR code button on the pairing screen reads the PC's code in the app, then asks you to confirm before pairing.
- **Rename and colour herding programs and their steps**: click a program's name (or a step's name) to change it, and use the small palette button next to it to colour it (9 colours, readable on the light and dark theme; "Normal colour" clears it). Works on a client's program, on the master program, and the colour shows on the client's program card. A client's program starts with the master's colours and can then be changed on its own.
- **Every client starts with the standard herding program** (new clients too): importing the program sheet (Programs & Quotes -> Master program -> Import program sheet) now also keeps the sheet's first mating day, and every client who has no program gets a copy of the master program starting on that day, with all of the sheet's dates. Each client's copy is edited on its own; delete one and it stays deleted. A client's quote is only made once there are products to quote, so no empty quotes are created.
- **Scan date**: every herding program has a "Scan date" step 77 days after the rams go in with the herd. It shows in the program's Dates card, the cost sheet and the calendar, and its timing can be changed per client (or on the master program).
- **The standard program is dates only**: the program every client starts with has the sheet's dates and notes but none of the master's products or doses - add a client's products on their own program, and the quote follows.
- **Print from the preview**: the PDF preview has a Print button that opens the normal Windows print dialog (the PDF viewer's own print button did nothing in the desktop app).
- **Tax certificate per client**: on a client's page, import their tax certificate (PDF, PNG or JPEG, up to 10 MB), view, download, replace or delete it. It is kept in the app's data, so it is in your backups.
- **Catalogue prices show excl. and incl. VAT**: on the catalog cards, the PDF catalogue and order forms, and in the price column beside the supplier's catalogue book (English and Afrikaans).
- **More than one catalogue**: under the catalog on the Products page, "More catalogues" lets you add any number of extra catalogue PDFs; each one goes below the last, and you can view, download, rename or delete them.
- **Copy a herding program to another client**: the copy button on a client's program (or "Copy program" on its page), then "Paste" on another client's page. The copy has the dates, steps, products and doses, but not the ticks, invoices or quote (it gets its own), and not the animal numbers unless you tick that box.
- **Select several and delete**: tick boxes on Clients, Products (table and catalog), Invoices, Quotes, Orders, Purchase Orders and the extra catalogues, then "Delete selected". Anything that can't be deleted (a client with invoices, a product on an old invoice) is listed with the reason and the rest are still deleted.
- **A much more useful dashboard**:
  - *Owed to you* (with how much is past due) and *Quotes waiting* cards open Invoices and Programs & Quotes; *Overdue treatments* opens the attention list.
  - **Needs attention**: one list of overdue treatments and scan dates (grouped by farm, two weeks back and ahead), past-due invoices, quotes sent over a week ago with no answer, accepted program dates not yet invoiced, and clients with no tax certificate, phone or address - with filter buttons. Older overdue steps (for example from the sheet's old first mating day) are counted, not listed.
  - Sales chart compared with the same month last year; herding programs agreed vs invoiced vs paid; top 5 clients and best-selling products over 12 months.
  - Quick actions (new client, quote, invoice, visit), today's visits with call and WhatsApp buttons, a weather card with livestock alerts, out-of-stock products, and a fuller system status (last backup, update waiting, changes waiting to sync).
- **New running animation in the header**: a calm, hand-drawn dusk scene - a collie, a cow and a sheep running across a misty paddock with the farmer's bakkie following, headlights on. The animals really gallop (every leg swings properly), the hills, trees and grass slide past at different speeds, the wheels turn and the headlight glows. It is slow and smooth on purpose. (With "reduce motion" on in Windows it shows as a still picture.)
- **Works on small screens**: on a phone or narrow window the menu slides in from a ☰ button, and wide lists scroll sideways instead of being cut off.
- **Herding programs and quotes are one**: every client's herding program is also their quote for the year - one menu item, **Programs & Quotes**.
  - The quote is made automatically and always matches the program: change a dose, an animal number, a price or a product on either side and both change.
  - Agreed packs, price and discount per product, shown on the program and on the quote.
  - Accepting the quote locks the program; each treatment date is then invoiced from the agreed lines with one click.
  - The quote PDF lists the products under each program date.
- **A client's herding program now looks like the "Ent en doseer kostes" sheet**, on its own page:
  - animals, client details and DEKTYD/LAMTYD at the top;
  - the sheet's columns (DATUM, TYD, PRODUK, VERPAK, PRYS EXCL VAT, DOSERING, PRODUK TOTAAL, TOTAAL R);
  - its sections - Lammers, Jong ooitjies en ramme, Ooie en ramme, Medisyne boks - each with its own TOTAAL;
  - TOTALE KOSTE and KOSTE PER DIER PER JAAR at the bottom;
  - the Kudde program's notes as a small fold-open line under each date.
- **Excel per client**: download a client's program as an Excel sheet in the same layout (it still calculates in Excel), and import a filled-in sheet back into that client's program.
- The Costs PDF is grouped in the same sections.
- **Auto-lock**: the app locks itself (PIN to carry on) after 2, 3, 5, 10, 15, 20, 25 or 30 minutes of nobody using it, or Off. Set under Settings -> Security & Auto-Lock; kept per computer/phone, on at 10 minutes to begin with.
- **Every client is a farm**: the farm's name is the heading everywhere (Clients list, client page, calendar, hover card), with the contact person under it. The client page has a "The farm" card: how many animals are on the farm (and the split by type, from the herding program's animal numbers), phone, email, farm and postal address.
- **Herding program invoices from the client page**: each program card shows how many dates are invoiced and a one-click button for the next date's invoice once the quote is accepted.
- **Visits can be changed**: the pencil on a client's appointment changes its date, time or reason, and every change shows on the System Calendar straight away.
- **Settings looks like the iPhone's Settings app**: a list (with search and your profile on top) and the page beside it - on a phone, the list first and a "Settings" back button. General, Security & Auto-Lock and Company details, then one entry per department (Clients, Programs & Quotes, Products, Orders, Invoices, Purchase Orders, Calendar, Weather, Product Calc), then Phones, Data & Backups and Legal.

### Changed
- The animal numbers boxes (Ooie, Ramme, ...) now line up and no longer wrap or shift when hovered.
- Quote validity, VAT, payment terms and document numbering moved from one big company form to the department they belong to.
- The client page no longer shows Registered Animals (animal records are kept).

### Security
- Text typed into the app is always plain text in the Excel download, never an Excel formula.

## 1.0.6 - 2026-10-06

### New
- **Kyron catalogue books**: load Kyron's English and Afrikaans catalogue PDFs (Products -> Catalog). The app shows them exactly as printed, with your pack sizes and prices in a column beside each page, and links the book's products to yours.
- **Order forms with tick boxes**: clients tick what they want and type how many, on the app's own catalogue or the Kyron book. A ticked item with no quantity counts as 1.
- **Send to clients**: WhatsApp and Email buttons on order forms. The PDF is saved to `Documents\Sandveld Vee Dienste\Sent to clients` and shown in Explorer, and the chat or email opens with a message ready - drag the file in and send.
- **Costed herding programs**, like the "Ent en doseer kostes" sheet:
  - every client gets their own copy of the master program to change freely; "Start again from the master program" resets it but keeps ticked-off steps;
  - five headcounts: Ooie, Ramme, Lammers, Jong ooitjies, Jong rammetjies;
  - per product: packs used and whole packs to buy, cost excluding VAT, step subtotals, total cost and cost per animal per year;
  - a medicine box (no date, fixed number of packs) and dates you can change per client;
  - a new Costs PDF, and quotes in whole packs.
- **Import cost sheet** on the Herding Program page (admins), next to the program sheet import.
- **Master program on the calendar**: pick any first mating day to see the whole program laid out.
- **Phones (first step towards the Android app)**: Settings -> Phones lets an admin pair staff phones with a QR code over the office Wi-Fi. The phone app itself is still to come.

### Security
- An account is locked for 15 minutes after 5 wrong passwords.

## 1.0.5 - 2026-09-29

### New
- **Herding program**: one master vaccinate-and-dose program imported from the business's Excel sheet, with per-client programs, ticked-off steps, quotes from ticked products, a PDF for the farmer, and steps on the calendar and dashboard.
- **Catalogue order forms**: a fillable catalogue PDF per client; the filled form is imported on the Quotes page as a draft quote.
- **Profile photos** for every user (sidebar, lock screen, staff list).

### Changed
- Company details moved into My Details -> "Company details (advanced)". Only name, address, phone, email and bank details are required.
- The Animals menu is hidden (records are kept), and the setup reminder bar can be hidden.

## 1.0.4 - 2026-09-28

### New
- **Product pictures**: upload a photo per product.
- **Editable product catalog**: a picture Catalog view and a Table view, every detail editable in place, products can be marked out of stock or hidden, and a client-facing catalogue PDF.
- "Powered by Kyron Agri" on the lock screen.

## 1.0.3 - 2026-09-27

### New
- **Sage-style invoices and quotes**: numbered to continue the Sage sequence, with due/expiry dates, line discounts, VAT when registered, and bank details and totals at the foot of the page.
- **Purchase orders** with suppliers.
- **Business and personal details**: business settings, bank fields, each user's phone printed as the sales rep, and a reminder bar while required details are missing.
- **PDF previews** of invoices and quotes, and hover cards for clients and documents.

### Fixed
- The app now retries starting its backend when Windows blocks the first launch.
- Saving a form no longer blanks fields it doesn't show (such as a document number or VAT number).

## 1.0.2 - 2026-09-25

### New
- **Licence agreement and privacy notice**, shown by the installer and under Settings -> Legal.
- **Weather page** with a 7-day forecast and livestock alerts (frost, heat, heavy rain, strong wind).
- The System Calendar is now a real month calendar.
- **Backups**: automatic daily backups with an optional copy to OneDrive, Google Drive or a USB drive; restore from any backup; a backup before every update; export everything to Excel.
- Header search (Ctrl+K) and a dark theme.

### Fixed
- Deleting a client, animal or product no longer leaves orphaned records behind; old invoices keep their product names.
- Dashboard revenue no longer counts cancelled invoices.
- Re-importing herding programs merges into existing ones instead of duplicating them.
- Dates entered anywhere no longer crash saving.

## 1.0.1 - 2026-09-24

### New
- Dashboard sales chart, and Excel/CSV import for products, clients and herding programs.
- Settings -> Software Update shows update status and can check on demand.
- New circular Sandveld Vee Dienste logo, and a grazing animation in the header.

### Fixed
- Failed saves now show an error message instead of silently doing nothing.

## 1.0.0 - 2026-09-24

First release: clients, animals, invoices, quotes, products, dosing calculator and herding programs, with sign-in (email/password or Google), a remembered-device PIN, automatic updates, and a Windows installer that needs no Python.
