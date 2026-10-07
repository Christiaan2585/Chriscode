import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { authService } from "../../../api/authService";
import { useAuth } from "../../../context/AuthContext";
import SettingsCard from "../SettingsCard";
import { detailOf, field, primary, secondary } from "./shared";

// Two-step sign-in with an authenticator app (Google/Microsoft Authenticator, Authy...):
// the password alone is no longer enough, so a guessed or leaked password cannot open the account.
const TwoStepCard = () => {
  const { user, refreshMe } = useAuth();
  const [setup, setSetup] = useState(null); // {secret, qr}
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(null); // the 8 codes, shown once
  const [off, setOff] = useState({ open: false, password: "", code: "" });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (error) {
      setMessage(detailOf(error, "That did not work."));
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => {
    const data = await authService.twoStepSetup();
    setSetup({ secret: data.secret, qr: await QRCode.toDataURL(data.uri, { margin: 1, width: 220 }) });
  });
  const confirm = () => run(async () => {
    const data = await authService.twoStepEnable(code.trim());
    setRecovery(data.recovery_codes);
    setSetup(null);
    setCode("");
    await refreshMe();
  });
  const turnOff = () => run(async () => {
    await authService.twoStepDisable(off.password, off.code.trim());
    setOff({ open: false, password: "", code: "" });
    await refreshMe();
  });

  const copy = () => navigator.clipboard?.writeText(recovery.join("\n"));

  return (
    <SettingsCard icon={ShieldCheck} title="Two-step sign-in">
      {recovery ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-emerald-700">Two-step sign-in is on.</p>
          <p className="text-sm text-slate-600">
            Save these 8 recovery codes somewhere safe (not on this computer only). Each works once, if you lose your phone.
            They are not shown again.
          </p>
          <ul className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm">{recovery.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="flex gap-2">
            <button type="button" className={secondary} onClick={copy}>Copy</button>
            <button type="button" className={primary} onClick={() => setRecovery(null)}>I have saved them</button>
          </div>
        </div>
      ) : user?.two_step_enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-700">On - signing in needs the 6-digit code from your authenticator app.</p>
          {off.open ? (
            <div className="space-y-2">
              <input type="password" className={field} placeholder="Your password" autoComplete="current-password" value={off.password} onChange={(e) => setOff({ ...off, password: e.target.value })} />
              <input className={field} placeholder="A code from the app (or a recovery code)" value={off.code} onChange={(e) => setOff({ ...off, code: e.target.value })} />
              <div className="flex gap-2">
                <button type="button" disabled={busy} className={primary} onClick={turnOff}>Turn off</button>
                <button type="button" className={secondary} onClick={() => setOff({ open: false, password: "", code: "" })}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className={secondary} onClick={() => setOff({ ...off, open: true })}>Turn off...</button>
          )}
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy).</li>
            <li>In the app, add an account and scan this picture - or type the key under it.</li>
            <li>Type the 6 digits the app shows, to make sure it works.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img src={setup.qr} alt="QR code for the authenticator app" className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-1" />
            <p className="break-all font-mono text-xs text-slate-600">{setup.secret.match(/.{1,4}/g).join(" ")}</p>
          </div>
          <div className="flex gap-2">
            <input className={`${field} max-w-[10rem] tracking-widest`} inputMode="numeric" placeholder="6 digits" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="button" disabled={busy || code.trim().length < 6} className={primary} onClick={confirm}>Turn on</button>
            <button type="button" className={secondary} onClick={() => setSetup(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Add a second lock: after your password, the app asks for a 6-digit code from your phone. Recommended for admins.</p>
          <button type="button" disabled={busy} className={primary} onClick={start}>Set up two-step sign-in</button>
        </div>
      )}
      {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
    </SettingsCard>
  );
};

export default TwoStepCard;
