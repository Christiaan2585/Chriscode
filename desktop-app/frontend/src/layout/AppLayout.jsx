import React, { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Users, ClipboardList, FileText, Settings, Calculator, Calendar, ShoppingCart, Package, Lock, LogOut, CloudSun, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import SetupReminder from "../components/SetupReminder";
import logo from "../assets/logo.png";
import GrazingHeaderStrip from "../components/GrazingHeaderStrip";
import GlobalSearch from "../components/GlobalSearch";
import ThemeToggle from "../components/ThemeToggle";
import PoweredBy from "../components/PoweredBy";
import Avatar from "../components/Avatar";

const NAV = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { to: "/clients", label: "Clients", Icon: Users },
  { to: "/programs", label: "Herding Program", Icon: ClipboardList },
  { to: "/calendar", label: "System Calendar", Icon: Calendar },
  { to: "/weather", label: "Weather", Icon: CloudSun },
  { to: "/quotes", label: "Quotes", Icon: FileText },
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

  return (
    <div className="app-bg flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="app-sidebar w-64 bg-emerald-900 text-white flex flex-col">
        <div className="p-6 text-2xl font-bold tracking-tight flex items-center gap-3">
          <img src={logo} alt="" className="w-10 h-10 rounded-full shrink-0" />
          Sandveld Vee Dienste
        </div>
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
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between gap-6 px-8">
          <h1 className="text-lg font-semibold text-slate-700 shrink-0 whitespace-nowrap">Management Portal</h1>
          <GlobalSearch />
          <div className="hidden lg:flex flex-1 justify-center min-w-0 overflow-hidden">
            <GrazingHeaderStrip />
          </div>
          <div className="flex-1 lg:hidden" />
          <ThemeToggle />
        </header>
        <SetupReminder user={user} />
        <div className="flex-1 overflow-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
