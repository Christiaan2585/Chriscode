import React from "react";
import { Lock, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Avatar from "../Avatar";
import SettingsCard from "./SettingsCard";

// Who is signed in on this computer, with Lock and Sign out (these used to be a menu in the sidebar).
const AccountCard = () => {
  const { user, lock, forgetDevice } = useAuth();
  return (
    <SettingsCard title="Signed in">
      <div className="flex items-center gap-3">
        <Avatar user={user} size="md" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{user?.name}</p>
          <p className="text-sm text-slate-500">{user?.is_admin ? "Admin" : "Staff"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={lock}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Lock size={14} /> Lock (keep me remembered)
        </button>
        <button type="button" onClick={forgetDevice}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <LogOut size={14} /> Sign out completely
        </button>
      </div>
    </SettingsCard>
  );
};

export default AccountCard;
