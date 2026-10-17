import { t } from "../utils/i18n";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { findItem } from "../components/settings/sections";
import { useSetupNeeds } from "../utils/useSetupNeeds";

// The set-up guide for a new PC: one step at a time through the settings that matter (your details, company banking, email,
// staff accounts, phones, backups). Each step is the real settings panel - nothing here is a copy - with Back / Skip / Next.
// Opened from the ? button, and any time later.
const STEPS = [
  { id: "my-details", title: "Your details", help: "Your phone number is printed as the sales rep on everything you make. A photo makes the lock screen friendlier." },
  { id: "company", title: "Company and banking", help: "Printed on every invoice and quote, so clients know who you are and where to pay.", adminOnly: true },
  { id: "email", title: "Email", help: "Pick your provider, type your address and password, and the app sends a test email to prove it works.", adminOnly: true },
  { id: "security", title: "Staff accounts", help: "Add the people who work with you. They sign in with their own email and password and see your data. Mark someone as limited to hide cost prices and the money reports.", adminOnly: true },
  { id: "phones", title: "Phones", help: "Pair staff phones so they can use the app in the field. The phone only works while the app is open on this PC.", adminOnly: true },
  { id: "backups", title: "Backups", help: "A copy of your data is made every day. Choose a OneDrive folder or a USB drive for a second copy that survives this PC.", adminOnly: true },
];

const SetupGuide = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const { business, own } = useSetupNeeds(user);
  const { data: mail } = useQuery({ queryKey: ["mail-status"], queryFn: async () => (await apiClient.get("/mail/status")).data });
  const steps = STEPS.filter((s) => user?.is_admin || !s.adminOnly);
  const step = steps[Math.min(index, steps.length - 1)];
  const ctx = { user };
  const item = findItem(step.id, ctx);
  const done = { "my-details": own.length === 0, company: business.length === 0, email: Boolean(mail?.configured) };
  const last = index >= steps.length - 1;
  const Panel = item?.Panel;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-800">{t("Set-up guide")}</h2>
        <p className="text-slate-500">{t("A few quick steps and the app is ready for real work. You can skip any of them and come back later.")}</p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label={t("Steps")}>
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => setIndex(i)} aria-current={i === index ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${i === index ? "border-emerald-500 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${i === index ? "bg-white/25" : done[s.id] ? "bg-emerald-100 text-emerald-700" : "bg-slate-100"}`}>
                {done[s.id] && i !== index ? <Check size={12} aria-label={t("Done")} /> : i + 1}
              </span>
              {t(s.title)}
            </button>
          </li>
        ))}
      </ol>

      <section className="space-y-4" aria-label={t(step.title)}>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-800">{t("Step {n} of {total}: {title}", { n: index + 1, total: steps.length, title: t(step.title) })}</p>
          <p className="mt-1">{t(step.help)}</p>
        </div>
        {Panel ? <Panel /> : <p className="text-sm text-slate-500">{t("This step isn't available on your account.")}</p>}
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <ArrowLeft size={16} /> {t("Back")}
        </button>
        <Link to="/" className="text-sm text-slate-500 hover:text-emerald-700">{t("Finish later")}</Link>
        <button type="button" onClick={() => (last ? navigate("/") : setIndex(index + 1))}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">
          {last ? t("Finish") : (done[step.id] ? t("Next") : t("Skip / Next"))} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default SetupGuide;
