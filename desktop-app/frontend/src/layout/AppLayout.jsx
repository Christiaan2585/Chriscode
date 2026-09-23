import React, { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { LayoutDashboard, Users, Dog, FileText, Settings, Calculator, Calendar, ShoppingCart, Package, Lock, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";

const AppLayout = () => {
  const { user, lock, forgetDevice } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user?.name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-emerald-900 text-white flex flex-col">
        <div className="p-6 text-2xl font-bold tracking-tight flex items-center gap-3">
          <img src={logo} alt="" className="w-10 h-10 rounded-full shrink-0" />
          Sandveld Vee Dienste
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link to="/" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link to="/clients" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <Users size={20} /> Clients
          </Link>
          <Link to="/animals" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <Dog size={20} /> Animals
          </Link>
          <Link to="/calendar" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <Calendar size={20} /> System Calendar
          </Link>
          <Link to="/quotes" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <FileText size={20} /> Quotes
          </Link>
          <Link to="/orders" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <ShoppingCart size={20} /> Orders
          </Link>
          <Link to="/products" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <Package size={20} /> Products
          </Link>
          <Link to="/calculator" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <Calculator size={20} /> Product Calc
          </Link>
          <Link to="/invoices" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <FileText size={20} /> Invoices
          </Link>
        </nav>
        <div className="p-4 border-t border-emerald-800">
          <Link to="/settings" className="flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-800 transition-colors">
            <Settings size={20} /> Settings
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <h1 className="text-lg font-semibold text-slate-700">Management Portal</h1>
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-2"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                  {initials}
                </div>
              )}
              <span className="text-sm text-slate-600">{user?.name}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() => { setMenuOpen(false); lock(); }}
                >
                  <Lock size={14} /> Lock (keep me remembered)
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() => { setMenuOpen(false); forgetDevice(); }}
                >
                  <LogOut size={14} /> Sign out completely
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
