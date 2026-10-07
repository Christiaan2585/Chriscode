import React, { useState } from "react";
import { Scale } from "lucide-react";
import licenceText from "../../legal/EULA.txt?raw";

const LegalSettings = () => {
  const [showLicence, setShowLicence] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
        <Scale size={18} /> Legal
      </h3>
      <p className="text-sm text-slate-600">Copyright &copy; 2026 Sandveld Vee Dienste. All rights reserved.</p>
      <button
        type="button"
        onClick={() => setShowLicence((shown) => !shown)}
        aria-expanded={showLicence}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
      >
        {showLicence ? "Hide" : "Read"} the licence agreement and privacy notice
      </button>
      {showLicence && (
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-xs leading-relaxed text-slate-600">
          {licenceText}
        </pre>
      )}
    </div>
  );
};

export default LegalSettings;
