import { useEffect, useState } from "react";
import { readStored, writeStored } from "./stored";

// useState that remembers its value on this device, so a screen reopens the way it was left (the Clients filters).
export function usePersistedState(key, initial) {
  const storageKey = `sandveld_ui_${key}`;
  const [value, setValue] = useState(() => readStored(storageKey, initial));
  useEffect(() => { writeStored(storageKey, value); }, [storageKey, value]);
  return [value, setValue];
}
