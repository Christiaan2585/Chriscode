import { currentLanguage, t } from "../utils/i18n";
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, ClipboardCopy, Rocket, Sparkles } from "lucide-react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { supportDetails, tipFor } from "../utils/helpTips";
import { OPEN_WHATS_NEW } from "./WhatsNew";

// The ? button in the header: a short tip for the page you are on, a tour of the first-time set-up, what's new, and a button
// that copies the details to paste into a message when asking for help (page, version, who - never client data).
const HelpButton = () => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef(null);
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { data: version } = useQuery({ queryKey: ["version"], queryFn: async () => (await apiClient.get("/version")).data, retry: false, enabled: open });
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const escape = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const copy = async () => {
    const text = supportDetails({ pathname, version: version?.version, userName: user?.name, language: currentLanguage });
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { window.prompt(t("Copy this and send it with your question:"), text); }
  };
  const item = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700";
  return (
    <div ref={root} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-label={t("Help")} title={t("Help")}
        className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700"><CircleHelp size={20} /></button>
      {open && (
        <div role="dialog" aria-label={t("Help")} className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <p className="border-b border-slate-100 p-4 text-sm leading-relaxed text-slate-600">{t(tipFor(pathname))}</p>
          <Link to="/setup" onClick={() => setOpen(false)} className={item}><Rocket size={16} aria-hidden="true" /> {t("Set-up guide")}</Link>
          <button type="button" className={item} onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_WHATS_NEW)); }}><Sparkles size={16} aria-hidden="true" /> {t("What's new")}</button>
          <button type="button" className={item} onClick={copy}><ClipboardCopy size={16} aria-hidden="true" /> {copied ? t("Copied - paste it in your message") : t("Copy details to ask for help")}</button>
        </div>
      )}
    </div>
  );
};

export default HelpButton;
