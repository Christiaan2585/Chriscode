import React, { Suspense, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, ClipboardList, FileText, Settings, Calculator, Calendar, ShoppingCart, Package, CloudSun, Truck, BarChart3, Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSetupNeeds } from "../utils/useSetupNeeds";
import logo from "../assets/logo.png";
import GrazingHeaderStrip from "../components/GrazingHeaderStrip";
import GlobalSearch from "../components/GlobalSearch";
import ThemeToggle from "../components/ThemeToggle";
import PoweredBy from "../components/PoweredBy";
import OutboxBadge from "../components/OutboxBadge";
import OfflineSupport from "../components/OfflineSupport";
import SyncStatus from "../components/SyncStatus";
import AutoLock from "../components/AutoLock";
import Reminders from "../components/Reminders";
import WhatsNew from "../components/WhatsNew";
import { AndroidUpdatePrompt } from "../components/AndroidUpdate";
import { isNative } from "../utils/pairing";

const NAV = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { to: "/clients", label: "Clients", Icon: Users },
  { to: "/calendar", label: "System Calendar", Icon: Calendar },
  { to: "/weather", label: "Weather", Icon: CloudSun },
  { to: "/programs", label: "Programs & Quotes", Icon: ClipboardList },
  { to: "/orders", label: "Orders", Icon: ShoppingCart },
  { to: "/products", label: "Products", Icon: Package },
  { to: "/calculator", label: "Product Calc", Icon: Calculator },
  { to: "/invoices", label: "Invoices", Icon: FileText },
  { to: "/purchase-orders", label: "Purchase Orders", Icon: Truck },
  { to: "/reports", label: "Reports", Icon: BarChart3 },
];

const navClass = ({ isActive }) =>
  `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? "nav-active bg-emerald-800" : "hover:bg-emerald-800"}`;

const AppLayout = () => {
  const { user } = useAuth();
  const setup = useSetupNeeds(user);
  // Phones and narrow windows: the sidebar slides in over the page from the
  // menu button and closes again on every page change.
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setNavOpen(false);
  }

  return (
    <div className="app-bg flex h-screen bg-slate-50 text-slate-900 font-sans">
      <AutoLock />
      <Reminders />
      <WhatsNew />
      {isNative() && <AndroidUpdatePrompt />}
      <OfflineSupport />
      {navOpen && (
        <button type="button" aria-label="Close the menu" onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" />
      )}
      {/* Sidebar */}
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-40 w-64 bg-emerald-900 text-white flex flex-col transition-transform md:static md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 pt-6 pb-4">
          <div className="text-xl leading-tight font-bold tracking-tight flex items-center gap-3">
            <img src={logo} alt="" className="w-11 h-11 rounded-full shrink-0" />
            <span className="min-w-0">Sandveld<br />Vee Dienste</span>
            <button type="button" aria-label="Close the menu" onClick={() => setNavOpen(false)}
              className="ml-auto rounded-lg p-1 text-emerald-200 hover:bg-emerald-800 md:hidden"><X size={20} /></button>
          </div>
          {user && (
            <p className="mt-3 text-sm leading-snug text-emerald-200" title="The sales rep printed on your quotes and invoices">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-emerald-300/70">Sales rep</span>
              <span className="block truncate font-semibold text-white">{user.name}</span>
              {user.phone && <span className="block truncate">{user.phone}</span>}
            </p>
          )}
        </div>
        <OutboxBadge />
        <p className="nav-label px-7 mt-2 text-xs font-medium uppercase tracking-wider text-emerald-300/70">Menu</p>
        <nav className="flex-1 min-h-0 overflow-y-auto px-4 space-y-1 mt-2">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon size={20} /> {label}
            </NavLink>
          ))}
        </nav>
        <PoweredBy onDark className="px-4 pb-3" />
        <div className="p-4 border-t border-emerald-800 space-y-1">
          <NavLink to="/settings" className={navClass}>
            <Settings size={20} /> Settings
            {setup.count > 0 && (
              <span title="Something needs your attention in Settings" aria-label={`${setup.count} ${setup.count === 1 ? "thing needs" : "things need"} attention in Settings`}
                className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">{setup.count}</span>
            )}
          </NavLink>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between gap-3 px-4 md:gap-6 md:px-8">
          <button type="button" aria-label="Open the menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}
            className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"><Menu size={22} /></button>
          <h1 className="hidden sm:block text-lg font-semibold text-slate-700 shrink-0 whitespace-nowrap">Management Portal</h1>
          <GlobalSearch />
          <div className="hidden lg:flex flex-1 justify-center min-w-0 overflow-hidden">
            <GrazingHeaderStrip />
          </div>
          <div className="flex-1 lg:hidden" />
          <SyncStatus />
          <OutboxBadge compact />
          <ThemeToggle />
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Suspense fallback={<div role="status" className="p-8 text-sm text-slate-500">Loading…</div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
