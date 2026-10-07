import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LogOut, ShieldCheck } from "lucide-react";
import { authService } from "../../api/authService";
import { useAuth } from "../../context/AuthContext";
import SettingsCard from "./SettingsCard";
import PasswordCard from "./security/PasswordCard";
import SecurityChecklist from "./security/SecurityChecklist";
import StaffAdmin from "./security/StaffAdmin";
import TwoStepCard from "./security/TwoStepCard";
import { primary, secondary } from "./security/shared";

// Everything about who can get in: your PIN and password, two-step sign-in, signing out everywhere,
// and (for admins) the staff accounts and a checklist of what to switch on.
const SecuritySettings = () => {
  const { user, refreshMe, signOutEverywhere } = useAuth();
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const changePin = useMutation({
    mutationFn: (pin) => authService.setupPin(pin),
    onSuccess: () => {
      setPinMsg("PIN updated.");
      setNewPin("");
      refreshMe();
    },
    onError: (err) => setPinMsg(err.response?.data?.detail || "Could not update PIN."),
  });

  return (
    <>
      <SettingsCard icon={ShieldCheck} title="Your sign-in">
        <p className="text-sm text-slate-600">Signed in as {user?.name} ({user?.email}){user?.is_admin ? " - admin" : ""}</p>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{5}$/.test(newPin)) return setPinMsg("PIN must be exactly 5 digits.");
            changePin.mutate(newPin);
          }}
        >
          <p className="text-sm font-medium text-slate-700">Change your 5-digit PIN</p>
          <p className="text-xs text-slate-400">The code you enter to get back into the app on this computer. Five wrong tries lock it for a while.</p>
          <div className="flex items-center gap-2">
            <input className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest" inputMode="numeric" maxLength={5}
              value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 5))} aria-label="New PIN" />
            <button type="submit" className={primary} disabled={changePin.isPending}>Update PIN</button>
          </div>
          {pinMsg && <p className="text-xs text-slate-500">{pinMsg}</p>}
        </form>
      </SettingsCard>

      <PasswordCard />
      <TwoStepCard />

      <SettingsCard icon={LogOut} title="Sign out everywhere">
        <p className="text-sm text-slate-600">
          Lost a phone, or used a shared computer? This signs your account out on every computer and phone, this one included.
          Everyone has to sign in again with their password.
        </p>
        {confirmingSignOut ? (
          <div className="flex items-center gap-2">
            <button type="button" className={primary} onClick={signOutEverywhere}>Yes, sign out everywhere</button>
            <button type="button" className={secondary} onClick={() => setConfirmingSignOut(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className={secondary} onClick={() => setConfirmingSignOut(true)}>Sign out everywhere...</button>
        )}
      </SettingsCard>

      {user?.is_admin && <StaffAdmin />}
      {user?.is_admin && <SecurityChecklist />}
    </>
  );
};

export default SecuritySettings;
