import { t } from "../utils/i18n";
import React from "react";
import { AlertTriangle } from "lucide-react";
import { shortfallText, stockShortfalls } from "../utils/stockWarnings";

// Shown while an invoice is being made when a line sells more than the counted stock. Only a heads-up: saving is still allowed.
const StockWarning = ({ lines, products }) => {
  const shortfalls = stockShortfalls(lines, products);
  if (!shortfalls.length) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle size={16} /> {t("Not enough stock on the shelf")}</p>
      <ul className="mt-1 list-disc pl-6">
        {shortfalls.map((s) => <li key={s.product_id}>{shortfallText(s)}</li>)}
      </ul>
      <p className="mt-1 text-xs text-amber-800">{t("You can still save it. The stock will go below zero until you count again.")}</p>
    </div>
  );
};

export default StockWarning;
