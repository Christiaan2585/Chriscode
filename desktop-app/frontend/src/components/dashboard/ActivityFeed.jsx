import { t } from "../../utils/i18n";
import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import apiClient from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Panel } from "./MoneyPanels";

const when = (value) => {
  const at = new Date(`${String(value).replace(" ", "T")}Z`); // the log keeps UTC
  if (Number.isNaN(at.getTime())) return "";
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return sameDay ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : at.toLocaleDateString([], { day: "numeric", month: "short" });
};

// Who did what, newest first - for an admin with staff accounts. Built from the activity log (never amounts or bodies).
const ActivityFeed = () => {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["audit", "feed"],
    queryFn: async () => (await apiClient.get("/audit", { params: { limit: 8 } })).data,
    enabled: Boolean(user?.is_admin),
    refetchInterval: 2 * 60 * 1000,
    retry: false,
  });
  if (!user?.is_admin) return null;
  const items = (data?.items || []).filter((e) => e.action !== "Signed in");
  return (
    <Panel icon={<History size={18} className="text-slate-500" />} title={t("Recent activity")}>
      {!data ? <p className="text-sm text-slate-400">{t("Loading…")}</p> : items.length === 0 ? <p className="text-sm text-slate-400">{t("Nothing yet.")}</p> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 py-2">
              <span className="w-16 shrink-0 text-xs text-slate-400">{when(e.at)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700"><span className="font-medium">{e.user_name || t("Someone")}</span> · {e.action}{e.summary ? ` - ${e.summary}` : ""}</span>
              {e.result !== "ok" && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-xs text-amber-800">{e.result}</span>}
            </li>
          ))}
        </ul>
      )}
      <Link to="/settings/activity" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">{t("See the full log")}</Link>
    </Panel>
  );
};

export default ActivityFeed;
