import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { NOTES } from "../whatsNew/notes";
import { APP_VERSION, markSeen, notesToShow, readSeen, startedAsReturningDevice } from "../utils/whatsNew";

export const OPEN_WHATS_NEW = "sandveld-whats-new";

// The one-time window after an update, listing what changed. Shown once per version on each computer or phone
// (what was last shown is kept in localStorage); Settings > General can open it again.
const WhatsNew = () => {
  const initial = useMemo(() => notesToShow(NOTES, readSeen(), APP_VERSION, startedAsReturningDevice), []);
  const [shown, setShown] = useState(initial);
  const button = useRef(null);

  // Nothing to announce (a new install, or this version was already shown): just remember where we are.
  useEffect(() => {
    if (initial.length === 0) markSeen(APP_VERSION);
  }, [initial]);

  useEffect(() => {
    const open = () => setShown(NOTES.slice(0, 1)); // Settings > General > "See what's new": the latest release again
    window.addEventListener(OPEN_WHATS_NEW, open);
    return () => window.removeEventListener(OPEN_WHATS_NEW, open);
  }, []);

  const close = () => {
    markSeen(APP_VERSION);
    setShown([]);
  };

  useEffect(() => {
    if (!shown.length) return undefined;
    button.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown.length) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="whats-new-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 p-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Sparkles size={18} /></span>
          <div>
            <h2 id="whats-new-title" className="text-lg font-semibold text-slate-800">What's new</h2>
            <p className="text-sm text-slate-500">Sandveld Vee Dienste {shown[0].version} - {shown[0].title}</p>
          </div>
        </div>
        <div className="space-y-5 overflow-y-auto p-5 text-sm text-slate-700">
          {shown.map((note) => (
            <div key={note.version} className="space-y-3">
              {shown.length > 1 && <h3 className="font-semibold text-slate-800">Version {note.version}</h3>}
              {note.sections.map((section) => (
                <div key={section.heading}>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">{section.heading}</h4>
                  <ul className="list-disc space-y-1 pl-5">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-200 p-4">
          <button ref={button} type="button" onClick={close}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">Got it</button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNew;
