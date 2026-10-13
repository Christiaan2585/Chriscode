import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startOfflineSupport } from "../offline/sync";
import { isNative } from "../utils/pairing";
import { onBackOnline } from "../offline/connectivity";
import { refreshKnownAddresses } from "../utils/knownAddresses";

// Phone only, mounted once someone is signed in: downloads the office data, then keeps it fresh and
// catches up when the office PC comes back (see offline/sync.js). Renders nothing.
const OfflineSupport = () => {
  const queryClient = useQueryClient();
  useEffect(() => (isNative() ? startOfflineSupport(queryClient) : undefined), [queryClient]);
  // Keep the PC's addresses up to date (every 6 hours at most, and whenever the PC comes back after being out of reach).
  useEffect(() => {
    if (!isNative()) return undefined;
    refreshKnownAddresses();
    return onBackOnline(() => refreshKnownAddresses({ force: true }));
  }, []);
  return null;
};

export default OfflineSupport;
