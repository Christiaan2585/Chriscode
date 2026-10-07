import React, { useState } from "react";
import ImportModal from "../ImportModal";
import SettingsCard from "./SettingsCard";
import { IMPORT_TYPES } from "./importTypes";

// "Import <things> from Excel / CSV" for one department.
const ImportButton = ({ type }) => {
  const [open, setOpen] = useState(false);
  const cfg = IMPORT_TYPES[type];

  return (
    <SettingsCard icon={cfg.icon} title={`Import ${cfg.label.toLowerCase()} from Excel / CSV`}>
      <p className="text-sm text-slate-500">Bulk-load an existing spreadsheet instead of typing everything in by hand.</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
      >
        Choose a file…
      </button>
      <ImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Import ${cfg.label}`}
        endpoint={cfg.endpoint}
        columnHint={cfg.columnHint}
        invalidateKeys={cfg.invalidateKeys}
        createdLabel={cfg.createdLabel}
        updatedLabel={cfg.updatedLabel}
      />
    </SettingsCard>
  );
};

export default ImportButton;
