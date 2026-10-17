import { t } from "../../utils/i18n";
import React from "react";
import {
  Calculator, Calendar, CloudSun, Database, FileText, History, Info, Landmark, Mail, Package, Scale, Settings as GearIcon,
  ShieldCheck, ShoppingCart, Smartphone, Trash2, Truck, UserRound, Users, ClipboardList, MessageSquareText,
} from "lucide-react";
import apiClient from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useSetupNeeds } from "../../utils/useSetupNeeds";
import { isNative } from "../../utils/pairing";
import MyDetails from "../MyDetails";
import BusinessSettings from "../BusinessSettings";
import PhoneSettings from "../PhoneSettings";
import { OPEN_WHATS_NEW } from "../WhatsNew";
import { AndroidUpdateSettings } from "../AndroidUpdate";
import PhonePairingSettings from "../PhonePairingSettings";
import ActivityLog from "./ActivityLog";
import AccountCard from "./AccountCard";
import AppearanceSettings from "./AppearanceSettings";
import AutoLockSetting from "./AutoLockSetting";
import RemindersSetting from "./RemindersSetting";
import RecycleBin from "./RecycleBin";
import EmailSettings from "./EmailSettings";
import MessageWording from "./MessageWording";
import GoogleSignInSettings from "./GoogleSignInSettings";
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
      <SettingsCard icon={Info} title={t("About")}>
        {isLoading ? (
          <p className="text-sm text-slate-400">Checking version...</p>
        ) : version ? (
          <div className="text-sm text-slate-600 space-y-1">
            <p><span className="font-medium">{t("Name:")}</span> {version.app_name}</p>
            <p><span className="font-medium">{t("Version:")}</span> {version.version}</p>
            {version.last_updated && <p><span className="font-medium">{t("Last updated:")}</span> {version.last_updated}</p>}
            <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_WHATS_NEW))}
              className="mt-1 font-medium text-emerald-700 hover:underline">{t("See what's new in this version")}</button>
          </div>
        ) : (
          <p className="text-sm text-red-500">Couldn't reach the backend to check the version.</p>
        )}
      </SettingsCard>
      {isNative() ? <AndroidUpdateSettings /> : <SoftwareUpdateSettings currentVersion={version?.version} />}
      <AppearanceSettings />
    </>
  );
};

const MyDetailsPanel = () => {
  const { user, refreshMe } = useAuth();
  return (
    <>
      <AccountCard />
      <MyDetails user={user} onSaved={refreshMe} />
    </>
  );
};

const SecurityPanel = () => (
  <>
    <AutoLockSetting />
    <RemindersSetting />
    <SecuritySettings />
  </>
);

const CompanyPanel = () => {
  const { user } = useAuth();
  return (
    <SettingsCard icon={Landmark} title={t("Company details")}>
      <p className="text-sm text-slate-500">{t("Printed on every invoice, quote and purchase order.")}</p>
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
  return missing ? t("{n} missing", { n: missing }) : null;
};

// What the Data & Backups row shows when it has been days since the last backup (an admin only).
const useBackupBadge = () => {
  const { user } = useAuth();
  const { backupStale, backup } = useSetupNeeds(user);
  return backupStale ? backup.text : null;
};

// The Settings list, in order. `color` is the rounded icon tile, like iOS.
// `show` decides who sees the row (phones only get what makes sense on them).
export const GROUPS = [
  {
    id: "general",
    title: null,
    items: [
      { id: "general", label: t("General"), subtitle: t("About, updates, appearance"), Icon: GearIcon, color: "bg-slate-500", Panel: GeneralPanel },
      { id: "security", label: t("Security & Auto-Lock"), subtitle: t("PIN, auto-lock, staff accounts"), Icon: ShieldCheck, color: "bg-red-500", Panel: SecurityPanel },
      { id: "company", label: t("Company details"), subtitle: t("Name, addresses, banking"), Icon: Landmark, color: "bg-blue-500", Panel: CompanyPanel, useBadge: useCompanyBadge },
    ],
  },
  {
    id: "departments",
    title: t("Departments"),
    items: [
      { id: "clients", label: t("Clients"), subtitle: t("Import clients"), Icon: Users, color: "bg-sky-500", Panel: ClientsPanel },
      { id: "quotes", label: t("Programs & Quotes"), subtitle: t("Quote validity, numbering, master program"), Icon: ClipboardList, color: "bg-emerald-600", Panel: QuotesPanel },
      { id: "products", label: t("Products"), subtitle: t("Catalog view, import"), Icon: Package, color: "bg-orange-500", Panel: ProductsPanel },
      { id: "orders", label: t("Orders"), subtitle: t("No settings yet"), Icon: ShoppingCart, color: "bg-purple-500", Panel: OrdersPanel },
      { id: "invoices", label: t("Invoices"), subtitle: t("VAT, payment terms, numbering"), Icon: FileText, color: "bg-rose-500", Panel: InvoicesPanel },
      { id: "purchase-orders", label: t("Purchase Orders"), subtitle: t("Numbering"), Icon: Truck, color: "bg-teal-600", Panel: PurchaseOrdersPanel },
      { id: "calendar", label: t("Calendar"), subtitle: t("Master program on the calendar"), Icon: Calendar, color: "bg-indigo-500", Panel: CalendarPanel },
      { id: "weather", label: t("Weather"), subtitle: t("Saved location"), Icon: CloudSun, color: "bg-cyan-500", Panel: WeatherPanel },
      { id: "calculator", label: t("Product Calc"), subtitle: t("No settings yet"), Icon: Calculator, color: "bg-slate-600", Panel: CalculatorPanel },
    ],
  },
  {
    id: "system",
    title: t("System"),
    items: [
      { id: "phones", label: t("Phones"), subtitle: t("Pair staff phones"), Icon: Smartphone, color: "bg-green-500", Panel: PhonesPanel, show: ({ user }) => isNative() || Boolean(user?.is_admin) },
      { id: "activity", label: t("Activity log"), subtitle: t("Who changed what"), Icon: History, color: "bg-slate-600", Panel: ActivityLog, show: ({ user }) => Boolean(user?.is_admin) },
      { id: "email", label: t("Email"), subtitle: t("Send documents from the app"), Icon: Mail, color: "bg-sky-500", Panel: EmailSettings, show: ({ user }) => Boolean(user?.is_admin) },
      { id: "google", label: t("Sign in with Google"), subtitle: t("One-click sign-in for staff with Gmail"), Icon: ShieldCheck, color: "bg-blue-600", Panel: GoogleSignInSettings, show: ({ user }) => Boolean(user?.is_admin) && !isNative() },
      { id: "messages", label: t("Messages to clients"), subtitle: t("The wording of quotes, invoices, reminders"), Icon: MessageSquareText, color: "bg-teal-500", Panel: MessageWording, show: ({ user }) => Boolean(user?.is_admin) },
      { id: "recycle-bin", label: t("Recycle bin"), subtitle: t("Restore deleted records"), Icon: Trash2, color: "bg-slate-500", Panel: RecycleBin, show: ({ user }) => Boolean(user?.is_admin) },
      { id: "backups", label: t("Data & Backups"), subtitle: t("Backups, restore, export"), Icon: Database, color: "bg-amber-500", Panel: BackupsPanel, useBadge: useBackupBadge },
      { id: "legal", label: t("Legal"), subtitle: t("Licence and privacy notice"), Icon: Scale, color: "bg-slate-400", Panel: LegalSettings },
    ],
  },
];

// The profile card at the top of the list opens this one.
export const PROFILE_ITEM = { id: "my-details", label: t("My Details"), Icon: UserRound, color: "bg-emerald-600", Panel: MyDetailsPanel };

export const visibleGroups = (ctx) =>
  GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.show || item.show(ctx)) })).filter((g) => g.items.length);

export const findItem = (id, ctx) =>
  id === PROFILE_ITEM.id ? PROFILE_ITEM : visibleGroups(ctx).flatMap((g) => g.items).find((item) => item.id === id);
