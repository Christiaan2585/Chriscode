// South African phone numbers are stored as entered (e.g. "082 888 8284" or
// "0828888284"). tel: and wa.me links both need a clean international-format
// number, so these helpers normalise once, in one place, rather than every
// page reinventing the same digit-stripping logic.

/** Strips everything but digits, then swaps a local leading 0 for the SA
 * country code (27) so wa.me links resolve correctly. Returns null if there's
 * nothing usable to link to. */
export function toIntlPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return "27" + digits.slice(1);
  if (digits.startsWith("27")) return digits;
  return digits;
}

/** A plain tel: link - works with the number as given, no country-code
 * rewriting needed since the dialer handles local numbers itself. */
export function toTelLink(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits ? `tel:${digits}` : null;
}

/** wa.me requires the full international number with no leading zero or
 * punctuation. `text` is optional - a pre-filled opening message. */
export function toWhatsAppLink(phone, text) {
  const intl = toIntlPhone(phone);
  if (!intl) return null;
  const base = `https://wa.me/${intl}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
