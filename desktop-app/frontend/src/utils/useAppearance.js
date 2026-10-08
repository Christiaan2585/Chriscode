import { useSyncExternalStore } from "react";
import { CHANGED, getScheme, getTheme } from "./theme";

// The current look ({mode, scheme}), kept in step with changes made anywhere (the header toggle, Settings).
let last = { mode: getTheme(), scheme: getScheme() };
const snapshot = () => {
  const mode = getTheme();
  const scheme = getScheme();
  if (mode !== last.mode || scheme !== last.scheme) last = { mode, scheme };
  return last;
};
const subscribe = (notify) => {
  window.addEventListener(CHANGED, notify);
  return () => window.removeEventListener(CHANGED, notify);
};

export const useAppearance = () => useSyncExternalStore(subscribe, snapshot, snapshot);
