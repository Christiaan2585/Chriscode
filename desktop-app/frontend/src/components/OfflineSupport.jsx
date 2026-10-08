import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startOfflineSupport } from "../offline/sync";
import { isNative } from "../utils/pairing";

// Phone only, mounted once someone is signed in: downloads the office data, then keeps it fresh and
// catches up when the office PC comes back (see offline/sync.js). Renders nothing.
const OfflineSupport = () => {
  const queryClient = useQueryClient();
  useEffect(() => (isNative() ? startOfflineSupport(queryClient) : undefined), [queryClient]);
  return null;
};

export default OfflineSupport;
