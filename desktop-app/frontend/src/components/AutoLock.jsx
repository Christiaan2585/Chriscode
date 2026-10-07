import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { idleLongEnough } from "../utils/idleLock";
import { getAutoLockMinutes, onAutoLockChanged } from "../utils/autoLockPreference";

const ACTIVITY = ["pointerdown", "pointermove", "mousedown", "keydown", "wheel", "scroll", "touchstart"];
const CHECK_EVERY_MS = 5000;
// A PDF open in the preview swallows mouse events (it's another page inside an
// iframe), so reading one counts as activity - but only this long, so walking
// away from an open PDF still locks.
const IFRAME_COUNTS_FOR_MS = 10 * 60_000;

// Mounted only while someone is signed in (AppLayout). Locks the app - same as
// the "Lock" menu item, so only the PIN is needed to come back - after the
// idle time chosen under Settings -> Security. Works from a timestamp rather
// than a countdown, so a sleeping laptop or a phone that was in a pocket locks
// the moment it wakes up.
const AutoLock = () => {
  const { lock } = useAuth();
  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    let minutes = getAutoLockMinutes();
    let lastActive = Date.now();
    let iframeSince = null;
    const touch = () => { lastActive = Date.now(); };

    const check = () => {
      const now = Date.now();
      if (!document.hidden && document.activeElement?.tagName === "IFRAME") {
        iframeSince ??= now;
        if (now - iframeSince < IFRAME_COUNTS_FOR_MS) lastActive = now;
      } else {
        iframeSince = null;
      }
      if (idleLongEnough(now, lastActive, minutes)) lockRef.current();
    };

    ACTIVITY.forEach((name) => window.addEventListener(name, touch, { capture: true, passive: true }));
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const stopListening = onAutoLockChanged((value) => { minutes = value; touch(); });

    return () => {
      ACTIVITY.forEach((name) => window.removeEventListener(name, touch, { capture: true }));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      stopListening();
    };
  }, []);

  return null;
};

export default AutoLock;
