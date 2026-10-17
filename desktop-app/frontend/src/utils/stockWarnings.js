// A warning while an invoice is being made: lines that sell more than the counted stock on the shelf. Never blocks (selling
// more than counted is allowed - the stock just goes below zero); it only tells the person before they save.
// Products with no count (stock_quantity null/undefined) are not tracked and never warn.

export function stockShortfalls(lines, products) {
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));
  const wanted = new Map();
  for (const line of lines || []) {
    const id = Number(line.product_id);
    const qty = Number(line.quantity);
    if (!id || !(qty > 0)) continue;
    wanted.set(id, (wanted.get(id) || 0) + qty); // the same product on two lines counts together
  }
  const out = [];
  for (const [id, qty] of wanted) {
    const product = byId.get(id);
    if (!product || product.stock_quantity === null || product.stock_quantity === undefined) continue;
    if (qty > Number(product.stock_quantity)) {
      out.push({ product_id: id, name: product.name, wanted: qty, have: Number(product.stock_quantity) });
    }
  }
  return out;
}

export const shortfallText = (s) =>
  s.have <= 0 ? `${s.name}: none on the shelf (you are selling ${s.wanted})` : `${s.name}: only ${s.have} on the shelf (you are selling ${s.wanted})`;
