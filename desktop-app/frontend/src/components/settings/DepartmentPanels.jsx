import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, ClipboardList, CloudSun, LayoutGrid, Rows3 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { PREF_KEYS, readPref, writePref } from "../../utils/preferences";
import BusinessSettings from "../BusinessSettings";
import ImportButton from "./ImportButton";
import SettingsCard from "./SettingsCard";

const OpenLink = ({ to, children }) => (
  <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">
    {children} <ArrowRight size={14} aria-hidden="true" />
  </Link>
);

const NothingYet = ({ name, to, singular = false }) => (
  <SettingsCard title="Nothing to set up here yet">
    <p className="text-sm text-slate-600">
      {name} {singular ? "has no settings of its own yet - anything it needs" : "have no settings of their own yet - anything they need"}{" "}
      (VAT, numbering, your company details) is set under the other departments.
    </p>
    <OpenLink to={to}>Open {name}</OpenLink>
  </SettingsCard>
);

// The numbering / VAT / validity fields are part of the business settings
// (one shared record); each department shows its own part. Only admins edit.
const BusinessPart = ({ parts }) => {
  const { user } = useAuth();
  return (
    <SettingsCard>
      <BusinessSettings canEdit={Boolean(user?.is_admin)} bare parts={parts} />
    </SettingsCard>
  );
};

export const ClientsPanel = () => (
  <>
    <ImportButton type="clients" />
    <OpenLink to="/clients">Open Clients</OpenLink>
  </>
);

export const QuotesPanel = () => (
  <>
    <BusinessPart parts={["quotes"]} />
    <SettingsCard icon={ClipboardList} title="Master herding program">
      <p className="text-sm text-slate-600">
        The program every new client program is copied from. Import the Kudde program sheet and the cost sheet there.
      </p>
      <OpenLink to="/programs/master">Open the master program</OpenLink>
    </SettingsCard>
    <ImportButton type="programs" />
  </>
);

export const ProductsPanel = () => {
  const [view, setView] = useState(() => (readPref(PREF_KEYS.productsView) === "table" ? "table" : "catalog"));
  const choose = (next) => {
    setView(next);
    writePref(PREF_KEYS.productsView, next);
  };
  const options = [["catalog", "Catalog", LayoutGrid, "Picture cards grouped by category"], ["table", "Table", Rows3, "A compact list"]];

  return (
    <>
      <SettingsCard title="How Products opens">
        <div role="radiogroup" aria-label="Products view" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map(([key, label, Icon, hint]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={view === key}
              onClick={() => choose(key)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                view === key ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:border-emerald-300"
              }`}
            >
              <Icon size={20} className="text-emerald-600" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-slate-800">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">Kept on this computer. You can still switch any time on the Products page.</p>
      </SettingsCard>
      <ImportButton type="products" />
      <OpenLink to="/products">Open Products</OpenLink>
    </>
  );
};

export const OrdersPanel = () => <NothingYet name="Orders" to="/orders" />;

export const InvoicesPanel = () => (
  <>
    <BusinessPart parts={["invoices"]} />
    <OpenLink to="/invoices">Open Invoices</OpenLink>
  </>
);

export const PurchaseOrdersPanel = () => (
  <>
    <BusinessPart parts={["purchase"]} />
    <OpenLink to="/purchase-orders">Open Purchase Orders</OpenLink>
  </>
);

export const CalendarPanel = () => {
  const [plan, setPlan] = useState(() => readPref(PREF_KEYS.calendarPlanDate) || "");
  const forget = () => {
    writePref(PREF_KEYS.calendarPlanDate, null);
    setPlan("");
  };

  return (
    <>
      <SettingsCard icon={CalendarDays} title="Master program on the calendar">
        {plan ? (
          <>
            <p className="text-sm text-slate-600">
              The calendar is showing the master program for a first mating day of <b>{plan}</b>.
            </p>
            <button type="button" onClick={forget}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-red-300 hover:text-red-600 transition-colors">
              Stop showing it
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Not showing the master program. Pick a first mating day at the top of the calendar to lay it out.
          </p>
        )}
      </SettingsCard>
      <OpenLink to="/calendar">Open the Calendar</OpenLink>
    </>
  );
};

const savedLocation = () => {
  try {
    return JSON.parse(readPref(PREF_KEYS.weatherLocation)) || null;
  } catch {
    return null;
  }
};

export const WeatherPanel = () => {
  const [location, setLocation] = useState(savedLocation);
  const forget = () => {
    writePref(PREF_KEYS.weatherLocation, null);
    writePref(PREF_KEYS.weatherAsked, null); // the Allow / Deny question comes back
    setLocation(null);
  };

  return (
    <>
      <SettingsCard icon={CloudSun} title="Weather location">
        {location ? (
          <>
            <p className="text-sm text-slate-600">
              The forecast is for <b>{location.label || `${location.lat}, ${location.lon}`}</b>.
            </p>
            <button type="button" onClick={forget}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-red-300 hover:text-red-600 transition-colors">
              Forget this location
            </button>
            <p className="text-xs text-slate-500">The Weather page will ask for this computer's location again (or let you search for a town).</p>
          </>
        ) : (
          <p className="text-sm text-slate-600">No location saved yet - the Weather page asks the first time you open it.</p>
        )}
      </SettingsCard>
      <OpenLink to="/weather">Open Weather</OpenLink>
    </>
  );
};

export const CalculatorPanel = () => <NothingYet name="The Product Calc" to="/calculator" singular />;
