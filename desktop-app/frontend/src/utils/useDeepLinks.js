import { useEffect } from "react";
import { isNative } from "./pairing";
import { goPath } from "./deepLink";

// On the phone, a home-screen shortcut (long-press the app icon -> "New client") arrives as sandveld://go/... : open that page.
// Capacitor's App plugin is only loaded on the phone.
export function useDeepLinks(navigate) {
  useEffect(() => {
    if (!isNative()) return undefined;
    let handle;
    let cancelled = false;
    import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      App.addListener("appUrlOpen", (event) => {
        const path = goPath(event?.url || "");
        if (path) navigate(path);
      }).then((h) => { if (cancelled) h.remove(); else handle = h; });
    });
    return () => { cancelled = true; handle?.remove(); };
  }, [navigate]);
}
