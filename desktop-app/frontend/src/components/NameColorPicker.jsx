import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette } from "lucide-react";
import { NAME_COLORS } from "../utils/nameColors";

// A small palette button: pick a colour for a name, or "Normal" to clear it.
// `onChange(key | null)` returns a promise; the menu closes when it's done.
// The menu floats above the page (a portal, fixed position): the sheet's
// table scrolls sideways, which would otherwise clip it.
const MENU_WIDTH = 192;
const NameColorPicker = ({ value, onChange, label = "name" }) => {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState(null); // where the menu goes, in window coordinates
  const button = useRef(null);
  const menu = useRef(null);

  const toggle = () => {
    if (open) return setOpen(false);
    const r = button.current.getBoundingClientRect();
    setSpot({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8)) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown") {
        if (e.key === "Escape") setOpen(false);
      } else if (!menu.current?.contains(e.target) && !button.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const away = () => setOpen(false); // the button moved, so the menu would be in the wrong place
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);

  const choose = async (key) => {
    try {
      await onChange(key);
      setOpen(false);
    } catch {
      /* the app's error toast says why; the menu stays open to try again */
    }
  };

  const current = NAME_COLORS.find((c) => c.key === value);

  return (
    <span className="relative inline-block align-middle">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Colour of ${label}${current ? ` (now ${current.label.toLowerCase()})` : ""}`}
        title="Change the colour"
        className="relative flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <Palette size={14} aria-hidden="true" />
        {current && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white" style={{ background: current.swatch }} />
        )}
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" aria-label={`Colour of ${label}`} style={{ position: "fixed", top: spot.top, left: spot.left, width: MENU_WIDTH }}
          className="z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1.5">
            {NAME_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                role="menuitemradio"
                aria-checked={value === c.key}
                aria-label={c.label}
                title={c.label}
                onClick={() => choose(c.key)}
                style={{ background: c.swatch }}
                className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  value === c.key ? "border-slate-800" : "border-transparent"
                }`}
              />
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => choose(null)} disabled={!value}
            className="mt-2 w-full rounded-md px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            Normal colour
          </button>
        </div>,
        document.body
      )}
    </span>
  );
};

export default NameColorPicker;
