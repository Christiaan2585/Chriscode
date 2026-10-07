import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, ShieldOff, Trash2, Unlock, UserPlus, Users as UsersIcon } from "lucide-react";
import { authService } from "../../../api/authService";
import { useAuth } from "../../../context/AuthContext";
import Avatar from "../../Avatar";
import Modal from "../../Modal";
import PasswordHint from "../../PasswordHint";
import SettingsCard from "../SettingsCard";
import { detailOf, field, primary, secondary } from "./shared";

const Action = ({ title, onClick, children, danger }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick}
    className={`rounded p-1.5 text-slate-400 transition-colors ${danger ? "hover:text-red-600" : "hover:text-emerald-700"}`}>{children}</button>
);

// Admins: the staff list, with what to do when someone is locked out, forgets their password,
// loses their phone, or leaves.
const StaffAdmin = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", is_admin: false });
  const [message, setMessage] = useState(null); // {ok, text}
  const [reset, setReset] = useState(null); // {user, password}
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["auth-users"] });
  const say = (ok, text) => setMessage({ ok, text });

  const { data: users } = useQuery({ queryKey: ["auth-users"], queryFn: authService.listUsers, enabled: !!user?.is_admin, retry: false });

  const add = useMutation({
    mutationFn: (payload) => authService.addUser(payload),
    onSuccess: () => {
      say(true, "Added. They will be asked to choose their own password when they first sign in.");
      setNewUser({ name: "", email: "", password: "", is_admin: false });
      refresh();
    },
    onError: (e) => say(false, detailOf(e, "Could not add the user.")),
  });
  const act = (label, fn) => async () => {
    try {
      await fn();
      say(true, label);
      refresh();
    } catch (e) {
      say(false, detailOf(e, "That did not work."));
    }
  };

  return (
    <SettingsCard icon={UsersIcon} title="Staff accounts">
      <ul className="divide-y divide-slate-100 text-sm text-slate-600">
        {(users || []).map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2">
              <Avatar user={u} />
              <span>
                {u.name} <span className="text-slate-400">({u.email})</span>
                {u.is_admin && <span className="ml-1 rounded bg-slate-100 px-1.5 text-xs">admin</span>}
                {u.two_step_enabled && <span className="ml-1 rounded bg-emerald-100 px-1.5 text-xs text-emerald-700">2-step</span>}
                {u.locked && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs text-red-700">locked</span>}
              </span>
            </span>
            {u.id !== user.id && (
              <span className="flex items-center">
                {u.locked && <Action title={`Unlock ${u.name}`} onClick={act("Unlocked.", () => authService.unlockUser(u.id))}><Unlock size={15} /></Action>}
                <Action title={`Set a new temporary password for ${u.name}`} onClick={() => setReset({ user: u, password: "" })}><KeyRound size={15} /></Action>
                <Action title={`Sign ${u.name} out everywhere`} onClick={act("Signed out everywhere.", () => authService.signOutUser(u.id))}><LogOut size={15} /></Action>
                {u.two_step_enabled && (
                  <Action title={`Turn off ${u.name}'s two-step sign-in (lost phone)`} onClick={act("Two-step sign-in turned off for them.", () => authService.resetTwoStep(u.id))}><ShieldOff size={15} /></Action>
                )}
                <Action danger title={`Deactivate ${u.name}`} onClick={() => { if (window.confirm(`Deactivate ${u.name}? They will not be able to sign in.`)) act("Deactivated.", () => authService.deactivateUser(u.id))(); }}><Trash2 size={15} /></Action>
              </span>
            )}
          </li>
        ))}
      </ul>
      {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}

      <form className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3" onSubmit={(e) => { e.preventDefault(); add.mutate(newUser); }}>
        <p className="col-span-2 text-sm font-medium text-slate-700">Add a teammate</p>
        <input className={`${field} col-span-2`} placeholder="Full name" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
        <input type="email" className={`${field} col-span-2`} placeholder="Email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
        <div className="col-span-2">
          <input type="password" className={field} placeholder="Temporary password" required minLength={10} autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          <PasswordHint password={newUser.password} email={newUser.email} name={newUser.name} />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={newUser.is_admin} onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })} /> Make this person an admin too
        </label>
        <button type="submit" disabled={add.isPending} className={`${primary} col-span-2 flex items-center justify-center gap-2`}><UserPlus size={14} /> Add teammate</button>
      </form>

      <Modal isOpen={!!reset} onClose={() => setReset(null)} title={`New temporary password for ${reset?.user.name}`}>
        {reset && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            try {
              await authService.resetPassword(reset.user.id, reset.password);
              say(true, `${reset.user.name} was signed out everywhere and must choose a new password at the next sign-in.`);
              refresh();
            } catch (err) {
              say(false, detailOf(err, "Could not set the password."));
            }
            setReset(null);
          }}>
            <p className="text-sm text-slate-600">They are signed out everywhere and must choose their own password when they next sign in.</p>
            <input type="password" required minLength={10} autoFocus autoComplete="new-password" className={field} value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} />
            <PasswordHint password={reset.password} email={reset.user.email} name={reset.user.name} />
            <div className="flex justify-end gap-2">
              <button type="button" className={secondary} onClick={() => setReset(null)}>Cancel</button>
              <button type="submit" className={primary}>Set password</button>
            </div>
          </form>
        )}
      </Modal>
    </SettingsCard>
  );
};

export default StaffAdmin;
