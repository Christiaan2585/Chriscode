import React, { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import { PROFILE_ITEM, findItem, visibleGroups } from "../components/settings/sections";
import { useMediaQuery } from "../utils/useMediaQuery";

// The tinted rounded square every row starts with, like the iPhone's Settings.
const IconTile = ({ Icon, color }) => (
  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${color}`}>
    <Icon size={18} aria-hidden="true" />
  </span>
);

const Row = ({ item, selected }) => {
  const badge = item.useBadge?.(); // fixed per row, so the hook order never changes
  return (
    <Link
      to={`/settings/${item.id}`}
      aria-current={selected ? "page" : undefined}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
        selected ? "bg-emerald-600 text-white" : "text-slate-800 hover:bg-slate-50"
      }`}
    >
      <IconTile Icon={item.Icon} color={item.color} />
      <span className="flex-1 truncate font-medium">{item.label}</span>
      {badge && (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${selected ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
          {badge}
        </span>
      )}
      <ChevronRight size={16} className={selected ? "text-white/70" : "text-slate-400"} aria-hidden="true" />
    </Link>
  );
};

const SettingsList = ({ ctx, current }) => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const groups = visibleGroups(ctx)
    .map((g) => ({ ...g, items: g.items.filter((i) => !needle || `${i.label} ${i.subtitle || ""}`.toLowerCase().includes(needle)) }))
    .filter((g) => g.items.length);

  return (
    <nav aria-label="Settings" className="space-y-5">
      <h2 className="text-3xl font-bold text-slate-800">Settings</h2>

      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings"
          aria-label="Search settings"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </label>

      {!needle && user && (
        <Link
          to={`/settings/${PROFILE_ITEM.id}`}
          aria-current={current?.id === PROFILE_ITEM.id ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            current?.id === PROFILE_ITEM.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Avatar user={user} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{user.name}</span>
            <span className={`block truncate text-xs ${current?.id === PROFILE_ITEM.id ? "text-white/80" : "text-slate-500"}`}>
              {user.is_admin ? "Admin" : "Staff"} · My Details, photo and phone number
            </span>
          </span>
          <ChevronRight size={16} className={current?.id === PROFILE_ITEM.id ? "text-white/70" : "text-slate-400"} aria-hidden="true" />
        </Link>
      )}

      {groups.map((group) => (
        <section key={group.id} aria-label={group.title || undefined}>
          {group.title && (
            <h3 className="mb-1.5 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
            {group.items.map((item) => <Row key={item.id} item={item} selected={current?.id === item.id} />)}
          </div>
        </section>
      ))}
      {!groups.length && needle && <p className="px-4 text-sm text-slate-500">Nothing matches "{query}".</p>}
    </nav>
  );
};

// iPad-style on a wide window (list on the left, the page beside it),
// iPhone-style on a phone (the list, then a page with a "Settings" back button).
const Settings = () => {
  const { section } = useParams();
  const { user } = useAuth();
  const wide = useMediaQuery("(min-width: 768px)");
  const ctx = { user };
  const current = section ? findItem(section, ctx) : null;

  if (section && !current) return <Navigate to="/settings" replace />;
  if (wide && !current) return <Navigate to="/settings/general" replace />;

  const detail = current && (
    <div className="space-y-4">
      {!wide && (
        <Link to="/settings" className="inline-flex items-center gap-0.5 text-sm font-medium text-emerald-700 hover:underline">
          <ChevronLeft size={18} aria-hidden="true" /> Settings
        </Link>
      )}
      <h2 className="text-2xl font-bold text-slate-800">{current.label}</h2>
      <div className="space-y-4">
        <current.Panel />
      </div>
    </div>
  );

  if (!wide) return current ? detail : <SettingsList ctx={ctx} current={current} />;

  return (
    <div className="flex h-full items-start gap-8">
      {/* Two panes that scroll on their own, like the iPad's Settings */}
      <aside className="h-full w-80 shrink-0 overflow-y-auto pb-2">
        <SettingsList ctx={ctx} current={current} />
      </aside>
      <div className="h-full min-w-0 max-w-3xl flex-1 overflow-y-auto pb-2 pr-1">{detail}</div>
    </div>
  );
};

export default Settings;
