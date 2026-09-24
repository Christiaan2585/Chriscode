import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, Users, Dog, Package } from "lucide-react";
import apiClient from "../api/client";

const PER_GROUP = 5;
const matches = (q, ...fields) => fields.some((f) => f && String(f).toLowerCase().includes(q));
const listQuery = (key, path, enabled) => ({
  queryKey: [key],
  queryFn: async () => (await apiClient.get(path)).data,
  enabled,
});

// Header search across clients, animals and products. Reuses the same
// query keys as the list pages, so it shares their cache instead of
// refetching; nothing loads until the box is first focused.
const GlobalSearch = () => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const { data: clients = [] } = useQuery(listQuery("clients", "/clients/", loaded));
  const { data: animals = [] } = useQuery(listQuery("animals", "/animals/", loaded));
  const { data: products = [] } = useQuery(listQuery("products", "/products/", loaded));

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const ownerName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    return [
      ...clients.filter((c) => matches(q, c.name, c.farm_name, c.email, c.phone)).slice(0, PER_GROUP)
        .map((c) => ({ key: `c${c.id}`, group: "Clients", Icon: Users, title: c.name, sub: c.farm_name || c.phone, to: `/clients/${c.id}` })),
      ...animals.filter((a) => matches(q, a.name, a.tag_id, a.breed)).slice(0, PER_GROUP)
        .map((a) => ({ key: `a${a.id}`, group: "Animals", Icon: Dog, title: a.name,
          sub: [a.species, a.tag_id && `Tag ${a.tag_id}`, ownerName[a.client_id]].filter(Boolean).join(" · "),
          to: `/clients/${a.client_id}` })),
      ...products.filter((p) => matches(q, p.name, p.code)).slice(0, PER_GROUP)
        .map((p) => ({ key: `p${p.id}`, group: "Products", Icon: Package, title: p.name,
          sub: `R ${Number(p.price || 0).toFixed(2)}${p.code ? ` · ${p.code}` : ""}`, to: "/products" })),
    ];
  }, [query, clients, animals, products]);

  const go = (result) => {
    navigate(result.to);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div className="relative shrink-0 w-48 lg:w-64">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search... (Ctrl+K)"
        onFocus={() => { setOpen(true); setLoaded(true); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        className="w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {open && query.trim() && (
        <div className="absolute left-0 top-full mt-2 w-96 max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl z-50 py-2">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No matches for "{query.trim()}"</p>
          ) : (
            results.map((r, i) => (
              <React.Fragment key={r.key}>
                {(i === 0 || results[i - 1].group !== r.group) && (
                  <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{r.group}</p>
                )}
                <button
                  type="button"
                  // mousedown, not click: click fires after the input's blur
                  // has already closed the list.
                  onMouseDown={(e) => { e.preventDefault(); go(r); }}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-slate-100" : ""}`}
                >
                  <r.Icon size={16} className="text-emerald-600 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-800 truncate">{r.title}</span>
                    {r.sub && <span className="block text-xs text-slate-500 truncate">{r.sub}</span>}
                  </span>
                </button>
              </React.Fragment>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
