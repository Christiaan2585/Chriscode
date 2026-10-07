// Auto-lock: after this many minutes with no mouse, key, touch or scroll the
// app locks itself and asks for the PIN again. The choice is per computer
// (or phone) - the lock screen is per device too.

export const AUTO_LOCK_OPTIONS = [
  { minutes: 0, label: "Off" },
  ...[2, 3, 5, 10, 15, 20, 25, 30].map((minutes) => ({ minutes, label: `${minutes} minutes` })),
];
export const DEFAULT_AUTO_LOCK_MINUTES = 10;

// A stored value only counts if it is one of the options (so a hand-edited
// or old value can never turn into "locks after 1 second").
export const parseAutoLockMinutes = (stored) => {
  const minutes = stored === null || stored === undefined || stored === "" ? NaN : Number(stored);
  return AUTO_LOCK_OPTIONS.some((o) => o.minutes === minutes) ? minutes : DEFAULT_AUTO_LOCK_MINUTES;
};

// Has it been quiet for the whole period? Off (0) never locks, and a clock
// that jumped backwards (now < lastActive) isn't "idle".
export const idleLongEnough = (now, lastActive, minutes) =>
  minutes > 0 && now >= lastActive && now - lastActive >= minutes * 60_000;
