import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import apiClient from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import SettingsCard from "../SettingsCard";

const KEY = "sandveld_security_checklist";
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};

// Things only the owner can switch on (Windows, GitHub, the phone's key) plus the ones the app can
// see for itself. Ticks for the first kind are kept on this computer.
const SecurityChecklist = () => {
  const { user } = useAuth();
  const [ticked, setTicked] = useState(load);
  const { data: backups } = useQuery({ queryKey: ["backups"], queryFn: async () => (await apiClient.get("/backups/")).data, enabled: !!user?.is_admin, retry: false });

  const toggle = (id) => {
    const next = { ...ticked, [id]: !ticked[id] };
    setTicked(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };

  const items = [
    { id: "two-step", done: !!user?.two_step_enabled, text: "Two-step sign-in is on for your account", how: "Settings > Security & Auto-Lock > Two-step sign-in." },
    { id: "locked-backups", done: !!backups?.settings?.encrypted, text: "Backups are locked with a passphrase", how: "Settings > Data & Backups > Lock backups. Write the passphrase down somewhere safe - you need it to restore on another PC." },
    { id: "extra-copy", done: !!backups?.settings?.extra_folder, text: "A backup copy is kept off this PC (USB or OneDrive)", how: "Settings > Data & Backups > Extra copy." },
    { id: "bitlocker", manual: true, text: "Windows disk encryption (BitLocker / Device encryption) is on for this PC", how: "Windows Settings > Privacy & security > Device encryption. Without it, anyone who takes the PC can read all your clients' details." },
    { id: "github-2fa", manual: true, text: "Two-step sign-in is on for the GitHub account that publishes your updates", how: "github.com/settings/security. Whoever controls that account can push an update to every PC." },
    { id: "signing-key", manual: true, text: "A copy of the Android signing key is stored somewhere safe, off this PC", how: "The key file (sandveld-release.jks) and its password. Lose it and every phone needs a fresh install." },
    { id: "phones", manual: true, text: "Old or lost phones have been removed", how: "Settings > Phones. Removing a phone locks it out at once." },
    { id: "own-accounts", manual: true, text: "Everyone uses their own account and a strong password", how: "Settings > Security & Auto-Lock > Staff accounts." },
  ];

  return (
    <SettingsCard icon={ListChecks} title="Security checklist">
      <p className="text-sm text-slate-500">Things to switch on that the app cannot do for you. Items marked "checked by the app" update themselves.</p>
      <ul className="space-y-2">
        {items.map((item) => {
          const done = item.manual ? !!ticked[item.id] : item.done;
          const Icon = done ? CheckCircle2 : Circle;
          return (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <button type="button" disabled={!item.manual} onClick={() => toggle(item.id)} aria-pressed={done} aria-label={item.text}
                className={`mt-0.5 shrink-0 ${done ? "text-emerald-600" : "text-slate-300"} ${item.manual ? "hover:text-emerald-500" : "cursor-default"}`}>
                <Icon size={18} />
              </button>
              <span>
                <span className={done ? "text-slate-500" : "font-medium text-slate-800"}>{item.text}</span>
                {!item.manual && <span className="ml-1 text-xs text-slate-400">(checked by the app)</span>}
                {!done && <span className="block text-xs text-slate-500">{item.how}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
};

export default SecurityChecklist;
