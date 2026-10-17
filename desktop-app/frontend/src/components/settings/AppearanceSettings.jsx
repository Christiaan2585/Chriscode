import { t } from "../../utils/i18n";
import React, { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun, Type } from "lucide-react";
import { TEXT_SIZES, getContrast, getTextSize, setContrast, setTextSize } from "../../utils/display";
import { LANGUAGES, currentLanguage, setLanguage } from "../../utils/i18n";
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
        <Check size={14} aria-label={t("Chosen")} />
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
  const [size, setSize] = useState(getTextSize);
  const [contrast, setContrastState] = useState(getContrast);
  useEffect(() => { setSize(getTextSize()); setContrastState(getContrast()); }, []);
  return (
    <SettingsCard icon={Palette} title={t("Appearance")}>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{t("Light or dark")}</p>
        <div className="grid max-w-sm grid-cols-2 gap-2" role="radiogroup" aria-label={t("Light or dark")}>
          <ModeButton value="light" current={mode} Icon={Sun}>{t("Light")}</ModeButton>
          <ModeButton value="dark" current={mode} Icon={Moon}>{t("Dark")}</ModeButton>
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">{t("Colour scheme")}</p>
        <p className="mb-3 text-sm text-slate-500">{t("Six looks, from farm colours to a quiet graphite. The choice is kept on this computer (or phone) only.")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={t("Colour scheme")}>
          {SCHEMES.map((s) => <Tile key={s.id} scheme={s} mode={mode} selected={scheme === s.id} />)}
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">{t("Language")}</p>
        <p className="mb-2 text-sm text-slate-500">{t("The language of the app's screens. Changing it reloads the app. Kept on this computer (or phone) only.")}</p>
        <div className="grid max-w-sm grid-cols-2 gap-2" role="radiogroup" aria-label={t("Language")}>
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={currentLanguage === l.id} onClick={() => currentLanguage !== l.id && setLanguage(l.id)}
              className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${currentLanguage === l.id ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>{l.label}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700"><Type size={16} /> {t("Text size")}</p>
        <p className="mb-2 text-sm text-slate-500">{t("Makes everything in the app bigger. Kept on this computer (or phone) only.")}</p>
        <div className="grid max-w-xl grid-cols-3 gap-2" role="radiogroup" aria-label={t("Text size")}>
          {TEXT_SIZES.map((s, i) => (
            <button key={s.id} type="button" role="radio" aria-checked={size === s.id} onClick={() => { setTextSize(s.id); setSize(s.id); }}
              className={`rounded-lg border px-3 py-2.5 text-center font-medium ${size === s.id ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              <span className="block leading-none" style={{ fontSize: `${0.9 + i * 0.3}rem` }}>Aa</span>
              <span className="mt-1 block text-xs">{t(s.label)}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="flex max-w-xl cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={contrast === "high"} onChange={(e) => { const v = e.target.checked ? "high" : "normal"; setContrast(v); setContrastState(v); }} />
          <span>
            <span className="block text-sm font-medium text-slate-700">{t("High contrast")}</span>
            <span className="block text-sm text-slate-500">{t("Stronger text and borders, easier to read in bright light or with tired eyes.")}</span>
          </span>
        </label>
      </div>
    </SettingsCard>
  );
};

export default AppearanceSettings;
