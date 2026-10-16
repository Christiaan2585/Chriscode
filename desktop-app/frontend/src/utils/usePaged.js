import { useEffect, useState } from "react";

export const PAGE_SIZE = 100;

// What a list shows when it only draws `limit` of its rows (pure, so it can be tested without React).
export function pageInfo(total, limit, size = PAGE_SIZE) {
  const shown = Math.min(limit, total);
  return { shown, more: total - shown, next: Math.min(size, total - shown) };
}

// A long list (3,000 invoices is 110,000 page elements and over a second to draw) shows PAGE_SIZE rows at a time with
// a "Show more" button. The count starts again whenever the list changes - a new search or filter.
export function usePaged(items, size = PAGE_SIZE) {
  const key = `${items.length}:${items[0]?.id ?? ""}`;
  const [limit, setLimit] = useState(size);
  useEffect(() => setLimit(size), [key, size]);
  const { shown, more } = pageInfo(items.length, limit, size);
  return {
    visible: more > 0 ? items.slice(0, limit) : items,
    total: items.length,
    shown,
    more,
    size,
    showMore: () => setLimit((l) => l + size),
    showAll: () => setLimit(items.length),
  };
}
