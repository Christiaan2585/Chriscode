import { useSyncExternalStore } from "react";

// True while the window matches a CSS media query, e.g. "(min-width: 768px)".
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
