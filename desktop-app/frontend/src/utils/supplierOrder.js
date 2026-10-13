// The text that goes with an order to a supplier (WhatsApp message or email body): the list itself, so it reads
// fine even where the PDF can't be attached. Used by components/QuickOrder.jsx.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const niceDate = (iso) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : "";
};

export const orderListText = (lines) => lines.map((l) => `${l.quantity} x ${l.description}`).join("\n");

const WORDS = {
  en: { hi: "Good day", intro: (me) => `Please supply the following to ${me}:`, number: "Order number", reference: "Reference", needed: "Needed by",
    deliver: "Deliver to", closing: "The order is attached as a PDF. Please confirm availability and the delivery date. Thank you," },
  af: { hi: "Goeie dag", intro: (me) => `Lewer asseblief die volgende aan ${me}:`, number: "Bestelling nommer", reference: "Verwysing", needed: "Benodig teen",
    deliver: "Lewer by", closing: "Die bestelling is as PDF aangeheg. Bevestig asseblief beskikbaarheid en die leweringsdatum. Dankie," },
};

export function supplierOrderMessage({ business = {}, supplier = {}, po = {}, lines = [], rep = {}, lang = "en" }) {
  const w = WORDS[lang] || WORDS.en;
  const details = [
    po.number && `${w.number}: ${po.number}`,
    po.reference && `${w.reference}: ${po.reference}`,
    niceDate(po.delivery_date) && `${w.needed}: ${niceDate(po.delivery_date)}`,
    po.notes && `${w.deliver}: ${po.notes.replace(/^\s*(deliver to|lewer by)\s*:\s*/i, "")}`,
  ].filter(Boolean);
  const signature = [rep.name || business.trading_name, rep.phone || business.phone].filter(Boolean).join(", ");
  return [`${w.hi} ${supplier.contact_person || supplier.name},`, "", w.intro(business.trading_name || ""), "", orderListText(lines), "",
    ...details, "", w.closing, signature].join("\n");
}
