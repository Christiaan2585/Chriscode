import React, { useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import PasswordHint from "../../PasswordHint";
import SettingsCard from "../SettingsCard";
import { detailOf, field, primary } from "./shared";

// Change your own password. Needs the current one (wrong tries count toward the lock, like signing in)
// and signs every other computer and phone out.
const PasswordCard = () => {
  const { user, changePassword } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // {ok, text}

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.again) return setMessage({ ok: false, text: "The two new passwords are not the same." });
    setBusy(true);
    setMessage(null);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", again: "" });
      setMessage({ ok: true, text: "Password changed. Every other computer and phone was signed out." });
    } catch (error) {
      setMessage({ ok: false, text: detailOf(error, "Could not change the password.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard icon={KeyRound} title="Your password">
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-sm text-slate-600">Current password
          <input type="password" required autoComplete="current-password" className={`${field} mt-1`} value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </label>
        <label className="block text-sm text-slate-600">New password
          <input type="password" required minLength={10} autoComplete="new-password" className={`${field} mt-1`} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          <PasswordHint password={form.next} email={user?.email} name={user?.name} />
        </label>
        <label className="block text-sm text-slate-600">New password again
          <input type="password" required autoComplete="new-password" className={`${field} mt-1`} value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} />
        </label>
        <button type="submit" disabled={busy} className={primary}>{busy ? "Saving..." : "Change password"}</button>
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
      </form>
    </SettingsCard>
  );
};

export default PasswordCard;
