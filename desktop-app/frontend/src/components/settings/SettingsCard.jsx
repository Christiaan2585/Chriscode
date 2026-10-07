import React from "react";

// The white card every Settings page is built from.
const SettingsCard = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
    {title && (
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        {Icon && <Icon size={18} />} {title}
      </h3>
    )}
    {children}
  </div>
);

export default SettingsCard;
