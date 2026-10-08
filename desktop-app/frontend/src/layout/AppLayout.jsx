import React, { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, ClipboardList, FileText, Settings, Calculator, Calendar, ShoppingCart, Package, Lock, LogOut, CloudSun, Truck, Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import SetupReminder from "../components/SetupReminder";
import logo from "../assets/logo.png";
import GrazingHeaderStrip from "../components/GrazingHeaderStrip";
import GlobalSearch from "../components/GlobalSearch";
import ThemeToggle from "../components/ThemeToggle";
import PoweredBy from "../components/PoweredBy";
import Avatar from "../components/Avatar";
import OutboxBadge from "../components/OutboxBadge";
import OfflineSupport from "../components/OfflineSupport";
import SyncStatus from "../components/SyncStatus";
import AutoLock from "../components/AutoLock";

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
];

const navClass = ({ isActive }) =>
  `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? "nav-active bg-emerald-800" : "hover:bg-emerald-800"}`;

const AppLayout = () => {
  const { user, lock, forgetDevice } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
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
      <OfflineSupport />
      {navOpen && (
        <button type="button" aria-label="Close the menu" onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" />
      )}
      {/* Sidebar */}
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-40 w-64 bg-emerald-900 text-white flex flex-col transition-transform md:static md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 py-6 text-xl leading-tight font-bold tracking-tight flex items-center gap-3">
          <img src={logo} alt="" className="w-11 h-11 rounded-full shrink-0" />
          <span className="min-w-0">Sandveld<br />Vee Dienste</span>
          <button type="button" aria-label="Close the menu" onClick={() => setNavOpen(false)}
            className="ml-auto rounded-lg p-1 text-emerald-200 hover:bg-emerald-800 md:hidden"><X size={20} /></button>
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
          {/* The signed-in user, with Lock / Sign out. */}
          <div className="relative">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-emerald-800"
              aria-label={`Account menu for ${user?.name || "you"}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Avatar user={user} size="md" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{user?.name}</span>
                <span className="block truncate text-xs text-emerald-200/80">{user?.is_admin ? "Admin" : "Staff"}</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() => { setMenuOpen(false); lock(); }}
                >
                  <Lock size={14} /> Lock (keep me remembered)
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() => { setMenuOpen(false); forgetDevice(); }}
                >
                  <LogOut size={14} /> Sign out completely
                </button>
              </div>
            )}
          </div>
          <NavLink to="/settings" className={navClass}>
            <Settings size={20} /> Settings
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
        <SetupReminder user={user} />
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
