import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { pushRecent, readStored, writeStored } from "../utils/stored";

// A searchable dropdown for picking one item out of a list that can get
// long (clients, products) - plain HTML <select> options aren't searchable,
// so finding one specific client or product means scrolling a long native
// popup. This renders our own list instead, with a filter box, which also
// sidesteps native <select> popups being an occasional Electron rough edge
// (see Calculator.jsx's ProductDropdown, which predates this and is kept
// separate since it also renders dosing-rule badges specific to that page).
//
// options: [{ value, label, sublabel? }]. value/onChange behave like a
// native select's value/e.target.value (always a string) so this drops into
// existing state handlers with minimal changes.
//
// recentKey: remember the last few picks on this device and list them first under "Recent".
// onCreate(query) + createLabel: a "+ New ..." button under the list (e.g. add a client without leaving the form).
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className = "",
  disabled = false,
  recentKey = null,
  onCreate = null,
  createLabel = "New",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const storageKey = recentKey ? `sandveld_recent_${recentKey}` : null;
  const [recent, setRecent] = useState(() => (storageKey ? readStored(storageKey, []) : []));
  const choose = (v) => {
    onChange(String(v));
    setOpen(false);
    if (storageKey) {
      const next = pushRecent(recent, v);
      setRecent(next);
      writeStored(storageKey, next);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Recent picks first (only the ones that still exist), then everything else once.
      const recents = recent.map((r) => options.find((o) => String(o.value) === String(r))).filter(Boolean);
      if (!recents.length) return options;
      return [...recents.map((o) => ({ ...o, recent: true })), ...options.filter((o) => !recents.includes(o))];
    }
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
    );
  }, [options, query, recent]);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white transition-all flex items-center justify-between text-left disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full outline-none text-sm py-0.5"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((o) => {
              const isSelected = String(o.value) === String(value);
              return (
                <button
                  key={`${o.recent ? "r" : "o"}-${o.value}`}
                  type="button"
                  onClick={() => choose(o.value)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-emerald-50 ${
                    isSelected ? "bg-emerald-50 font-semibold text-emerald-800" : "text-slate-700"
                  }`}
                >
                  <div>{o.label}{o.recent && <span className="ml-2 text-xs font-normal text-slate-400">recent</span>}</div>
                  {o.sublabel && <div className="text-xs text-slate-400">{o.sublabel}</div>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-slate-400">No matches for "{query}".</p>
            )}
          </div>
          {onCreate && (
            <button type="button" onClick={() => { setOpen(false); onCreate(query.trim()); }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
              <Plus size={14} /> {createLabel}{query.trim() ? ` "${query.trim()}"` : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
