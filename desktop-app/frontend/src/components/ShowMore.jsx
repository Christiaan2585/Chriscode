import React from "react";
import { pageInfo } from "../utils/usePaged";

// The bar under a long list: "Showing 100 of 3,000  [Show 100 more] [Show all]". Nothing when the whole list is on screen.
const ShowMore = ({ paged }) => {
  if (!paged || paged.more <= 0) return null;
  const { next } = pageInfo(paged.total, paged.shown, paged.size);
  const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-emerald-400";
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 p-3 text-sm text-slate-500">
      <span role="status">Showing {paged.shown.toLocaleString()} of {paged.total.toLocaleString()}</span>
      <button type="button" className={button} onClick={paged.showMore}>Show {next.toLocaleString()} more</button>
      <button type="button" className={button} onClick={paged.showAll}>Show all</button>
    </div>
  );
};

export default ShowMore;
