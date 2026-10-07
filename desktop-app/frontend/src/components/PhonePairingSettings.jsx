import React from "react";
import { Smartphone } from "lucide-react";
import { clearPairing } from "../utils/pairing";

// Android only (see pages/Settings.jsx): lets this phone forget its office
// PC and pair again, e.g. after moving to a different PC.
const PhonePairingSettings = () => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
    <h3 className="flex items-center gap-2 font-semibold text-slate-800">
      <Smartphone size={18} /> Office PC Pairing
    </h3>
    <p className="text-sm text-slate-500">This phone is paired with an office PC. Forgetting it will ask to pair again next time the app opens.</p>
    <button
      type="button"
      onClick={async () => {
        if (window.confirm("Forget this phone's pairing with the office PC?")) {
          await clearPairing();
          window.location.reload();
        }
      }}
      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
    >
      Forget this PC
    </button>
  </div>
);

export default PhonePairingSettings;
