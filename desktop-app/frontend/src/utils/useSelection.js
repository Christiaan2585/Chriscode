import { useCallback, useMemo, useState } from "react";

// Which rows of a list are ticked (for "Delete selected"). `ids` are the rows
// currently shown: a row that is filtered out or deleted stops counting.
export function useSelection(ids) {
  const [picked, setPicked] = useState(() => new Set());
  const shown = useMemo(() => new Set(ids), [ids]);
  const selected = useMemo(() => [...picked].filter((id) => shown.has(id)), [picked, shown]);

  const toggle = useCallback((id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const allSelected = ids.length > 0 && selected.length === ids.length;
  const toggleAll = useCallback(() => setPicked(allSelected ? new Set() : new Set(ids)), [allSelected, ids]);
  const clear = useCallback(() => setPicked(new Set()), []);

  return { selected, count: selected.length, has: (id) => picked.has(id), toggle, allSelected, toggleAll, clear };
}

// Deletes the ids one at a time with `deleteOne(id)`; a record that refuses
// (a client with invoices, a product on an old invoice...) is reported with the
// reason and never stops the rest. Returns {deleted, failed: [{id, reason}]}.
export async function deleteMany(ids, deleteOne) {
  let deleted = 0;
  const failed = [];
  for (const id of ids) {
    try {
      await deleteOne(id);
      deleted += 1;
    } catch (error) {
      const detail = error?.response?.data?.detail;
      failed.push({ id, reason: typeof detail === "string" ? detail : "It couldn't be deleted." });
    }
  }
  return { deleted, failed };
}
