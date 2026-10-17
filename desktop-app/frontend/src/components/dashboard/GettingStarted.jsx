import { t } from "../../utils/i18n";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Rocket, X } from "lucide-react";
import apiClient from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { buildChecklist } from "../../utils/gettingStarted";
import { useSetupNeeds } from "../../utils/useSetupNeeds";
import { readStored, writeStored } from "../../utils/stored";

const HIDDEN_KEY = "sandveld_getting_started_hidden";

// The first thing a new business sees on the Dashboard: six small steps, ticked off from what really exists, each
// with a button that opens the right screen. Disappears by itself when everything is done (or when hidden).
const GettingStarted = () => {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(() => readStored(HIDDEN_KEY, false));
  const { business } = useSetupNeeds(user);
  const { data: counts } = useQuery({ queryKey: ["analytics", "counts"], queryFn: async () => (await apiClient.get("/analytics/counts")).data });
  const { data: mail } = useQuery({ queryKey: ["mail-status"], queryFn: async () => (await apiClient.get("/mail/status")).data });
  const { data: backups, isError: noBackups } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => (await apiClient.get("/backups/")).data,
    enabled: Boolean(user?.is_admin),
    retry: false,
  });
  const list = buildChecklist({
    isAdmin: Boolean(user?.is_admin), businessMissing: business, user, mailConfigured: mail?.configured, counts,
    extraBackup: !user?.is_admin ? null : backups ? Boolean(backups.settings?.extra_folder) : noBackups ? false : null,
  });
  if (hidden || !user || !list.ready || list.complete) return null;

  const hide = () => { setHidden(true); writeStored(HIDDEN_KEY, true); };
  return (
    <section aria-label={t("Getting started")} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Rocket size={18} className="text-emerald-600" /> {t("Getting started")}</h3>
          <p className="text-sm text-slate-600">{t("{done} of {total} done.", { done: list.doneCount, total: list.total })} {t("A few small steps and the app is ready for real work.")}</p>
        </div>
        <button type="button" onClick={hide} aria-label={t("Hide Getting started")} title={t("Hide this")} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600"><X size={18} /></button>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={list.doneCount} aria-valuemin={0} aria-valuemax={list.total}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(list.doneCount / list.total) * 100}%` }} />
      </div>
      <ul className="space-y-2">
        {list.steps.map((step) => (
          <li key={step.id} className="flex items-center gap-3 text-sm">
            {step.done ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-label={t("Done")} /> : <Circle size={18} className="shrink-0 text-slate-300" aria-label={t("Not done yet")} />}
            <span className={`min-w-0 flex-1 ${step.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
              <span className="font-medium">{t(step.label)}</span>
              {!step.done && step.why && <span className="block text-xs text-slate-500">{t(step.why)}</span>}
            </span>
            {!step.done && <Link to={step.link} className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1 font-medium text-emerald-700 hover:bg-emerald-50">{t("Do this")}</Link>}
          </li>
        ))}
      </ul>
      <Link to="/setup" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">{t("Walk me through it, one step at a time")}</Link>
    </section>
  );
};

export default GettingStarted;
