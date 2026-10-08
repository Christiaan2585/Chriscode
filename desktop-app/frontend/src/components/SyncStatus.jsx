import React from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useReachable } from "../offline/connectivity";
import { useSyncState } from "../offline/sync";
import { isNative } from "../utils/pairing";

const timeOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Phone only. A small pill in the top bar: "Offline" while the office PC cannot be reached (the screens then
// show the copy saved on this phone), or the progress of a download / refresh. Literal colours so the dark
// theme cannot dim them.
const SyncStatus = () => {
  const reachable = useReachable();
  const sync = useSyncState();
  if (!isNative()) return null;
  if (!reachable) {
    return (
      <span role="status" className="flex shrink-0 items-center gap-1 rounded-full bg-[#fbbf24] px-2.5 py-1 text-xs font-semibold text-[#1c1917]"
        title={sync.lastSyncedAt ? `Showing the copy saved at ${timeOf(sync.lastSyncedAt)}` : "No saved copy yet"}>
        <CloudOff size={14} aria-hidden="true" /> Offline
      </span>
    );
  }
  if (sync.running && sync.total > 0 && (sync.deep || !sync.lastSyncedAt)) {
    return (
      <span role="status" className="flex shrink-0 items-center gap-1 rounded-full bg-[#bae6fd] px-2.5 py-1 text-xs font-semibold text-[#0c4a6e]">
        <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> {Math.min(sync.done, sync.total)}/{sync.total}
      </span>
    );
  }
  return null;
};

export default SyncStatus;
