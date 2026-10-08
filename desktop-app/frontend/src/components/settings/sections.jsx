import React from "react";
import {
  Calculator, Calendar, CloudSun, Database, FileText, History, Info, Landmark, Package, Scale, Settings as GearIcon,
  ShieldCheck, ShoppingCart, Smartphone, Truck, UserRound, Users, ClipboardList,
} from "lucide-react";
import apiClient from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { isNative } from "../../utils/pairing";
import MyDetails from "../MyDetails";
import BusinessSettings from "../BusinessSettings";
import PhoneSettings from "../PhoneSettings";
import PhonePairingSettings from "../PhonePairingSettings";
import ActivityLog from "./ActivityLog";
import AppearanceSettings from "./AppearanceSettings";
import AutoLockSetting from "./AutoLockSetting";
import BackupSettings from "./BackupSettings";
import {
  CalculatorPanel, CalendarPanel, ClientsPanel, InvoicesPanel, OrdersPanel, ProductsPanel, PurchaseOrdersPanel,
  QuotesPanel, WeatherPanel,
} from "./DepartmentPanels";
import LegalSettings from "./LegalSettings";
import SecuritySettings from "./SecuritySettings";
import SettingsCard from "./SettingsCard";
import SoftwareUpdateSettings from "./SoftwareUpdateSettings";

const useVersion = () =>
  useQuery({ queryKey: ["version"], queryFn: async () => (await apiClient.get("/version")).data, retry: false });

const GeneralPanel = () => {
  const { data: version, isLoading } = useVersion();
  return (
    <>
      <SettingsCard icon={Info} title="About">
        {isLoading ? (
          <p className="text-sm text-slate-400">Checking version...</p>
        ) : version ? (
          <div className="text-sm text-slate-600 space-y-1">
            <p><span className="font-medium">Name:</span> {version.app_name}</p>
            <p><span className="font-medium">Version:</span> {version.version}</p>
            {version.last_updated && <p><span className="font-medium">Last updated:</span> {version.last_updated}</p>}
          </div>
        ) : (
          <p className="text-sm text-red-500">Couldn't reach the backend to check the version.</p>
        )}
      </SettingsCard>
      <SoftwareUpdateSettings currentVersion={version?.version} />
      <AppearanceSettings />
    </>
  );
};

const MyDetailsPanel = () => {
  const { user, refreshMe } = useAuth();
  return <MyDetails user={user} onSaved={refreshMe} />;
};

const SecurityPanel = () => (
  <>
    <AutoLockSetting />
    <SecuritySettings />
  </>
);

const CompanyPanel = () => {
  const { user } = useAuth();
  return (
    <SettingsCard icon={Landmark} title="Company details">
      <p className="text-sm text-slate-500">Printed on every invoice, quote and purchase order.</p>
      <BusinessSettings canEdit={Boolean(user?.is_admin)} bare parts={["company"]} />
    </SettingsCard>
  );
};

const PhonesPanel = () => (isNative() ? <PhonePairingSettings /> : <PhoneSettings />);

const BackupsPanel = () => {
  const { data: version } = useVersion();
  return <BackupSettings databasePath={version?.database_path} />;
};

// What the Company row shows beside its name: how many invoice details are missing.
const useCompanyBadge = () => {
  const { data } = useQuery({ queryKey: ["business"], queryFn: async () => (await apiClient.get("/business/")).data });
  const missing = data?.missing?.length || 0;
  return missing ? `${missing} missing` : null;
};

// The Settings list, in order. `color` is the rounded icon tile, like iOS.
// `show` decides who sees the row (phones only get what makes sense on them).
export const GROUPS = [
  {
    id: "general",
    title: null,
    items: [
      { id: "general", label: "General", subtitle: "About, updates, appearance", Icon: GearIcon, color: "bg-slate-500", Panel: GeneralPanel },
      { id: "security", label: "Security & Auto-Lock", subtitle: "PIN, auto-lock, staff accounts", Icon: ShieldCheck, color: "bg-red-500", Panel: SecurityPanel },
      { id: "company", label: "Company details", subtitle: "Name, addresses, banking", Icon: Landmark, color: "bg-blue-500", Panel: CompanyPanel, useBadge: useCompanyBadge },
    ],
  },
  {
    id: "departments",
    title: "Departments",
    items: [
      { id: "clients", label: "Clients", subtitle: "Import clients", Icon: Users, color: "bg-sky-500", Panel: ClientsPanel },
      { id: "quotes", label: "Programs & Quotes", subtitle: "Quote validity, numbering, master program", Icon: ClipboardList, color: "bg-emerald-600", Panel: QuotesPanel },
      { id: "products", label: "Products", subtitle: "Catalog view, import", Icon: Package, color: "bg-orange-500", Panel: ProductsPanel },
      { id: "orders", label: "Orders", subtitle: "No settings yet", Icon: ShoppingCart, color: "bg-purple-500", Panel: OrdersPanel },
      { id: "invoices", label: "Invoices", subtitle: "VAT, payment terms, numbering", Icon: FileText, color: "bg-rose-500", Panel: InvoicesPanel },
      { id: "purchase-orders", label: "Purchase Orders", subtitle: "Numbering", Icon: Truck, color: "bg-teal-600", Panel: PurchaseOrdersPanel },
      { id: "calendar", label: "Calendar", subtitle: "Master program on the calendar", Icon: Calendar, color: "bg-indigo-500", Panel: CalendarPanel },
      { id: "weather", label: "Weather", subtitle: "Saved location", Icon: CloudSun, color: "bg-cyan-500", Panel: WeatherPanel },
      { id: "calculator", label: "Product Calc", subtitle: "No settings yet", Icon: Calculator, color: "bg-slate-600", Panel: CalculatorPanel },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      { id: "phones", label: "Phones", subtitle: "Pair staff phones", Icon: Smartphone, color: "bg-green-500", Panel: PhonesPanel, show: ({ user }) => isNative() || Boolean(user?.is_admin) },
      { id: "activity", label: "Activity log", subtitle: "Who changed what", Icon: History, color: "bg-slate-600", Panel: ActivityLog, show: ({ user }) => Boolean(user?.is_admin) },
      { id: "backups", label: "Data & Backups", subtitle: "Backups, restore, export", Icon: Database, color: "bg-amber-500", Panel: BackupsPanel },
      { id: "legal", label: "Legal", subtitle: "Licence and privacy notice", Icon: Scale, color: "bg-slate-400", Panel: LegalSettings },
    ],
  },
];

// The profile card at the top of the list opens this one.
export const PROFILE_ITEM = { id: "my-details", label: "My Details", Icon: UserRound, color: "bg-emerald-600", Panel: MyDetailsPanel };

export const visibleGroups = (ctx) =>
  GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.show || item.show(ctx)) })).filter((g) => g.items.length);

export const findItem = (id, ctx) =>
  id === PROFILE_ITEM.id ? PROFILE_ITEM : visibleGroups(ctx).flatMap((g) => g.items).find((item) => item.id === id);
