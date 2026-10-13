import React, { useEffect, useState } from "react";
import { Power } from "lucide-react";

const Switch = ({ on, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${on ? "bg-emerald-600" : "bg-slate-300"}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
  </button>
);

const Row = ({ title, text, ...rest }) => (
  <div className="flex items-start gap-3">
    <Switch label={title} {...rest} />
    <div className="text-sm"><div className="font-medium text-slate-700">{title}</div><div className="text-xs text-slate-500">{text}</div></div>
  </div>
);

// Settings -> Phones, in the PC app only (ready-mode.js in the Electron main process): phones can only connect while this
// app is running, so these keep it running - in the tray when the window is closed, from the moment Windows starts, and
// without the PC going to sleep.
const ReadyForPhones = () => {
  const api = window.electronAPI;
  const [mode, setMode] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api?.getReadyMode?.().then(setMode).catch(() => setError("Could not read these settings."));
  }, [api]);
  if (!api?.getReadyMode) return null; // phones and plain browsers

  const change = (patch) => api.setReadyMode(patch).then((next) => { setMode(next); setError(""); }).catch(() => setError("That did not save."));
  const all = mode && mode.keepRunning && mode.preventSleep && (mode.startWithWindows || !mode.canAutostart);
  const master = (on) => change({ keepRunning: on, preventSleep: on, startWithWindows: on && mode.canAutostart });

  return (
    <section aria-label="Always ready for phones" className="space-y-3 rounded-lg border border-slate-200 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Power size={16} /> Always ready for phones</h4>
      <p className="text-xs text-slate-500">
        Phones can only connect while this app is running and this PC is awake. Turn this on and the app stays running in the
        background (the small icon near the clock), starts when Windows starts, and keeps the PC from going to sleep.
      </p>
      {!mode ? <p className="text-xs text-slate-400">Loading...</p> : (
        <>
          <div className="flex items-center gap-3 text-sm font-medium text-slate-800">
            <Switch label="Always ready for phones" on={Boolean(all)} onChange={master} />
            Always ready for phones <span className="text-xs font-normal text-emerald-700">(recommended)</span>
          </div>
          {!mode.phonesAllowed && <p className="text-xs text-amber-700">Switch on "Allow phones" above - closing the window only keeps the app running while phones are allowed.</p>}
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-slate-600">Choose one by one</summary>
            <div className="mt-3 space-y-3">
              <Row title="Keep running when the window is closed" text="Closing the window hides it near the clock instead of quitting. Right-click that icon to quit."
                on={mode.keepRunning} onChange={(v) => change({ keepRunning: v })} />
              <Row title="Start when Windows starts" text={mode.canAutostart ? "Starts quietly in the background, so phones work even before anyone opens the app." : "Only in the installed app."}
                on={mode.startWithWindows} disabled={!mode.canAutostart} onChange={(v) => change({ startWithWindows: v })} />
              <Row title="Do not let this PC go to sleep" text="A sleeping PC cannot answer phones. The screen can still switch off; this uses a little more power."
                on={mode.preventSleep} onChange={(v) => change({ preventSleep: v })} />
            </div>
          </details>
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  );
};

export default ReadyForPhones;
