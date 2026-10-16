import { currentLanguage, translate } from "./i18n.js";

// "Undo" after a delete (components/UndoDelete.jsx): every record delete goes to the recycle bin, so the newest
// bin entries ARE what was just deleted. Pure parts here, tested in undo.test.mjs.

// DELETE /clients/12, /invoices/7 ... (a whole record). Lines, payments and notes are not recycle-bin records.
const RECORD = /^(?:https?:\/\/[^/]+)?\/(clients|invoices|quotes|orders|products|purchase-orders|suppliers|programs)\/\d+\/?(?:\?.*)?$/;

export const isRecordDelete = (method, url) => String(method || "").toLowerCase() === "delete" && RECORD.test(String(url || ""));

// The bin lists newest first; what was just deleted is the first n.
export const newestN = (items, n) => (n > 0 ? (items || []).slice(0, n) : []);

export const deletedMessage = (items, lang = currentLanguage) =>
  items.length === 1 ? `${translate("Deleted", lang)}${items[0].label ? ` ${items[0].label}` : ""}` : translate("Deleted {n} items", lang, { n: items.length });
