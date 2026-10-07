import React, { useState } from "react";
import { Check, Timer } from "lucide-react";
import SettingsCard from "./SettingsCard";
import { AUTO_LOCK_OPTIONS } from "../../utils/idleLock";
import { getAutoLockMinutes, setAutoLockMinutes } from "../../utils/autoLockPreference";

// Settings -> Security -> Auto-Lock: like the iPhone's list, one row per
// choice with a tick on the current one. Applies at once (no Save button).
const AutoLockSetting = () => {
  const [minutes, setMinutes] = useState(getAutoLockMinutes);
  const choose = (value) => {
    setMinutes(value);
    setAutoLockMinutes(value);
  };

  return (
    <SettingsCard icon={Timer} title="Auto-Lock">
      <p className="text-sm text-slate-600">
        Lock the app when nobody has used it for this long. You'll only need your PIN to carry on.
      </p>
      <div role="radiogroup" aria-label="Lock after" className="overflow-hidden rounded-lg border border-slate-200 divide-y divide-slate-100">
        {AUTO_LOCK_OPTIONS.map((option) => {
          const selected = option.minutes === minutes;
          return (
            <button
              key={option.minutes}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(option.minutes)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
            >
              {option.label}
              {selected && <Check size={18} className="text-emerald-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        This is kept on this computer (or phone) only. Anything you were typing when it locks is lost, so save first.
        A PDF you have open counts as using the app for up to 10 minutes.
      </p>
    </SettingsCard>
  );
};

export default AutoLockSetting;
