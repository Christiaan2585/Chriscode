import React, { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { subscribeOutbox } from "../utils/outbox";

// Sidebar indicator for queued offline actions (Android, Phase 4) - stays
// hidden everywhere else since the queue is only ever non-empty on a phone
// that's lost the office Wi-Fi.
const OutboxBadge = ({ compact = false }) => {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeOutbox((queue) => setCount(queue.length)), []);
  if (count === 0) return null;
  // The top bar's small version, so a phone can see queued changes without opening the menu.
  if (compact) {
    return (
      <span role="status" className="flex shrink-0 items-center gap-1 rounded-full bg-[#fbbf24] px-2.5 py-1 text-xs font-semibold text-[#1c1917] md:hidden">
        <CloudOff size={14} aria-hidden="true" /> {count} waiting
      </span>
    );
  }
  return (
    <p className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-amber-900/40 px-3 py-2 text-xs text-amber-200">
      <CloudOff size={14} className="shrink-0" />
      {count} {count === 1 ? "change" : "changes"} waiting to sync with the office PC
    </p>
  );
};

export default OutboxBadge;
