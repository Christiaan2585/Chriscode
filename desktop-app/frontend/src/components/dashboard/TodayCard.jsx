import { t } from "../../utils/i18n";
import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sunset } from "lucide-react";
import apiClient from "../../api/client";
import { money } from "../../utils/format";
import { Panel } from "./MoneyPanels";

const Stat = ({ label, value, sub }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <div className="text-xl font-bold text-slate-800">{value}</div>
    <div className="text-xs text-slate-500">{label}</div>
    {sub && <div className="text-xs text-slate-400">{sub}</div>}
  </div>
);

// "Today": what was done today (invoices made, money received, things sent, new clients) and what is still waiting.
const TodayCard = () => {
  const { data } = useQuery({
    queryKey: ["analytics", "today"],
    queryFn: async () => (await apiClient.get("/analytics/today")).data,
    refetchInterval: 5 * 60 * 1000,
  });
  const quiet = data && !data.invoices.count && !data.payments.count && !data.sent && !data.new_clients;
  return (
    <Panel icon={<Sunset size={18} className="text-amber-500" />} title={t("Today")}>
      {!data ? <p className="text-sm text-slate-400">{t("Loading…")}</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("Invoices made")} value={data.invoices.count} sub={data.invoices.count ? money(data.invoices.total) : null} />
            <Stat label={t("Money received")} value={money(data.payments.total)} sub={data.payments.count ? `${data.payments.count} ${data.payments.count === 1 ? "payment" : "payments"}` : null} />
            <Stat label={t("Sent to clients")} value={data.sent} />
            <Stat label={t("New clients")} value={data.new_clients} />
          </div>
          {quiet && <p className="text-sm text-slate-400">{t("Nothing done yet today.")}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">{t("Still waiting:")}</span>
            <Link to="/invoices" className="hover:text-emerald-700">
              {data.waiting.overdue_invoices ? `${data.waiting.overdue_invoices} overdue ${data.waiting.overdue_invoices === 1 ? "invoice" : "invoices"} (${money(data.waiting.overdue_total)})` : t("No overdue invoices")}
            </Link>
            <Link to="/programs" className="hover:text-emerald-700">
              {data.waiting.quotes ? `${data.waiting.quotes} ${data.waiting.quotes === 1 ? "quote" : "quotes"} waiting for an answer` : t("No quotes waiting")}
            </Link>
          </div>
        </div>
      )}
    </Panel>
  );
};

export default TodayCard;
