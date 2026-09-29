import React from "react";

// Optional: the Kyron Agri logo is shown when an image named kyron-agri-logo
// is in src/assets (the build picks it up automatically); without it the
// name is shown as text.
const KYRON_LOGO = Object.values(
  import.meta.glob("../assets/kyron-agri-logo.{png,jpg,jpeg,svg,webp}", { eager: true, import: "default" })
)[0];

// "Powered by Kyron Agri" - under the lock screen keypad and above Settings
// in the sidebar. `onDark` is for the green sidebar.
const PoweredBy = ({ onDark = false, className = "" }) => (
  <div className={`flex items-center justify-center gap-2 text-xs ${onDark ? "text-emerald-200/80" : "text-slate-400"} ${className}`}>
    <span>Powered by</span>
    {KYRON_LOGO ? (
      <img src={KYRON_LOGO} alt="Kyron Agri" className="h-10 w-auto max-w-[8rem] object-contain" />
    ) : (
      <span className={`font-semibold ${onDark ? "text-white" : "text-slate-500"}`}>Kyron Agri</span>
    )}
  </div>
);

export default PoweredBy;
