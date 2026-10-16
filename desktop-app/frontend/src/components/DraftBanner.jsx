import { t } from "../utils/i18n";
import React from "react";

// "We brought back what you were typing" at the top of a new invoice/quote form that was restored from a draft.
const DraftBanner = ({ what, onDiscard }) => (
  <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
    <span>{t("We brought back the {what} you were typing.", { what: t(what) })}</span>
    <button type="button" onClick={onDiscard} className="font-semibold underline hover:no-underline">{t("Start fresh")}</button>
  </div>
);

export default DraftBanner;
