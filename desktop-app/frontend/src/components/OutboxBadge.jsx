import React, { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { subscribeOutbox } from "../utils/outbox";

// Sidebar indicator for queued offline actions (Android, Phase 4) - stays
// hidden everywhere else since the queue is only ever non-empty on a phone
// that's lost the office Wi-Fi.
const OutboxBadge = () => {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeOutbox((queue) => setCount(queue.length)), []);
  if (count === 0) return null;
  return (
    <p className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-amber-900/40 px-3 py-2 text-xs text-amber-200">
      <CloudOff size={14} className="shrink-0" />
      {count} {count === 1 ? "change" : "changes"} waiting to sync with the office PC
    </p>
  );
};

export default OutboxBadge;
