import React from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import SettingsCard from "./SettingsCard";
import { SCHEMES, previewColors } from "../../utils/colorSchemes";
import { setScheme, setTheme } from "../../utils/theme";
import { useAppearance } from "../../utils/useAppearance";

// A little drawing of the app in a scheme's colours: sidebar, a page with a card, a button and a link.
const Preview = ({ id, mode }) => {
  const c = previewColors(id, mode);
  return (
    <div className="flex h-24 overflow-hidden rounded-lg" style={{ background: c.page, border: `1px solid ${c.line}` }} aria-hidden="true">
      <div className="w-1/4 space-y-1.5 p-2" style={{ background: c.sidebar }}>
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: c.accentText, opacity: 0.9 }} />
        <div className="h-1.5 w-full rounded-full" style={{ background: "#ffffff", opacity: 0.22 }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: "#ffffff", opacity: 0.22 }} />
      </div>
      <div className="flex-1 space-y-1.5 p-2">
        <div className="h-1.5 w-1/3 rounded-full" style={{ background: c.text }} />
        <div className="space-y-1.5 rounded-md p-2" style={{ background: c.card, border: `1px solid ${c.line}` }}>
          <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.muted }} />
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-9 rounded" style={{ background: c.accent }} />
            <div className="h-1.5 w-8 rounded-full" style={{ background: c.accentText }} />
          </div>
        </div>
      </div>
    </div>
  );
};

const Tile = ({ scheme, mode, selected }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={() => setScheme(scheme.id)}
    className={`relative rounded-xl border p-3 text-left transition ${selected ? "border-emerald-500 ring-2 ring-emerald-500/40" : "border-slate-200 hover:border-slate-400"}`}
  >
    <Preview id={scheme.id} mode={mode} />
    <div className="mt-2 flex items-center justify-between gap-2">
      <span className="font-semibold text-slate-800">{scheme.name}</span>
      <span className="flex gap-1" aria-hidden="true">
        {[300, 500, 700, 900].map((step) => <span key={step} className="h-3 w-3 rounded-full" style={{ background: scheme.swatch[step] }} />)}
      </span>
    </div>
    <p className="mt-0.5 text-sm text-slate-500">{scheme.blurb}</p>
    {selected && (
      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[#ffffff]">
        <Check size={14} aria-label="Chosen" />
      </span>
    )}
  </button>
);

const ModeButton = ({ value, current, Icon, children }) => (
  <button
    type="button"
    role="radio"
    aria-checked={current === value}
    onClick={() => setTheme(value)}
    className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${current === value ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
  >
    <Icon size={16} /> {children}
  </button>
);

// Settings -> General -> Appearance: light or dark, and the colour scheme. Both are remembered on this computer or phone.
const AppearanceSettings = () => {
  const { mode, scheme } = useAppearance();
  return (
    <SettingsCard icon={Palette} title="Appearance">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Light or dark</p>
        <div className="grid max-w-sm grid-cols-2 gap-2" role="radiogroup" aria-label="Light or dark">
          <ModeButton value="light" current={mode} Icon={Sun}>Light</ModeButton>
          <ModeButton value="dark" current={mode} Icon={Moon}>Dark</ModeButton>
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Colour scheme</p>
        <p className="mb-3 text-sm text-slate-500">Five looks taken from the farm. The choice is kept on this computer (or phone) only.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Colour scheme">
          {SCHEMES.map((s) => <Tile key={s.id} scheme={s} mode={mode} selected={scheme === s.id} />)}
        </div>
      </div>
    </SettingsCard>
  );
};

export default AppearanceSettings;
