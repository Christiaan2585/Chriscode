# Changelog

All notable changes to Sandveld Vee Dienste. Newest first.

## 1.0.7 - 2026-10-07

### New
- **Android app (first version)**: the same app on staff phones, connected to the office PC over the Wi-Fi. Pair a phone under Settings -> Phones on the PC; the phone asks before pairing and only pairs with an office-network address. Ticking program steps and new quotes are kept on the phone while it's away from the office Wi-Fi, and sent when it's back.
- **Works on small screens**: on a phone or narrow window the menu slides in from a ☰ button, and wide lists scroll sideways instead of being cut off.
- **Herding programs and quotes work together**:
  - "Quote the whole program" in a client's program, or tick products as before.
  - Quotes page -> **From herding program**: pick the client, the program and the steps.
  - A program's quote stays linked to it: the program lists its quotes, and each step shows which quote it's on and whether it's Draft, Sent or Accepted.
  - The quote PDF lists the products under each program step and date.
  - **Update from program** works a Draft or Sent quote out again after doses, animal numbers or prices change. Accepted quotes are never changed.
- **A client's herding program now looks like the "Ent en doseer kostes" sheet**, on its own page:
  - animals, client details and DEKTYD/LAMTYD at the top;
  - the sheet's columns (DATUM, TYD, PRODUK, VERPAK, PRYS EXCL VAT, DOSERING, PRODUK TOTAAL, TOTAAL R);
  - its sections - Lammers, Jong ooitjies en ramme, Ooie en ramme, Medisyne boks - each with its own TOTAAL;
  - TOTALE KOSTE and KOSTE PER DIER PER JAAR at the bottom;
  - the Kudde program's notes as a small fold-open line under each date.
- **Excel per client**: download a client's program as an Excel sheet in the same layout (it still calculates in Excel), and import a filled-in sheet back into that client's program.
- The Costs PDF is grouped in the same sections.

### Changed
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
