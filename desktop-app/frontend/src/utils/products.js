// Products saved before the catalog switches existed have them as null,
// which means yes.
export const isActive = (p) => p.is_active !== false;
export const isInStock = (p) => p.in_stock !== false;

export const categoryOf = (p) => p.category || "Uncategorised";

// The standard markup used for supplier price lists (same as the
// /products/import endpoint): excl VAT = cost x 1.25, incl VAT = excl x 1.15.
export const recomputeFromCost = (cost) => {
  const c = Number(cost);
  if (cost === "" || cost === null || Number.isNaN(c)) return {};
  const exclVat = Math.round(c * 1.25 * 10000) / 10000;
  const inclVat = Math.round(exclVat * 1.15 * 10000) / 10000;
  return { price_excl_vat: exclVat, price: inclVat };
};

// Product pickers (invoices, quotes, orders) offer only active products,
// plus whatever is already selected so an old line still shows its name.
export const pickerProducts = (products, selectedId) =>
  (products || []).filter((p) => isActive(p) || p.id === Number(selectedId));

// The selling price excl VAT shown on a catalog card: the stored one, or the price incl VAT less the standard 15%.
export const priceExcl = (product) =>
  product.price_excl_vat ?? (product.price == null ? null : Math.round((product.price / 1.15) * 100) / 100);
