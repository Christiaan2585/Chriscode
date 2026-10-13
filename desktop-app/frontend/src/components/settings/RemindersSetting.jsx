import React, { useState } from "react";
import { Bell } from "lucide-react";
import SettingsCard from "./SettingsCard";
import { remindersOn, setRemindersOn } from "../../utils/reminders";

// Settings -> General: the daily Windows reminder. Per computer, applies at once.
const RemindersSetting = () => {
  const [on, setOn] = useState(remindersOn);
  if (!window.electronAPI) return null; // phones and plain browsers don't show Windows notifications
  const toggle = () => { setRemindersOn(!on); setOn(!on); };
  return (
    <SettingsCard icon={Bell} title="Daily reminder">
      <p className="text-sm text-slate-600">
        Once a day, when the app is open, Windows shows a short note if a treatment, scan or invoice is overdue or due this week.
      </p>
      <button type="button" role="switch" aria-checked={on} onClick={toggle}
        className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
        <span className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${on ? "justify-end bg-emerald-500" : "justify-start bg-slate-300"}`}>
          <span className="h-5 w-5 rounded-full bg-white shadow" />
        </span>
        {on ? "On" : "Off"}
      </button>
    </SettingsCard>
  );
};

export default RemindersSetting;
