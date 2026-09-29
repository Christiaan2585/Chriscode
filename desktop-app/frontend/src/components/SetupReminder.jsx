import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import BusinessSettings from "./BusinessSettings";

const DISMISS_KEY = "sandveld_setup_later";
// The bar stays hidden until what's missing changes (see `signature`).
const HIDE_BAR_KEY = "sandveld_setup_bar_hidden";

const readHiddenBar = () => {
  try {
    return localStorage.getItem(HIDE_BAR_KEY);
  } catch {
    return null;
  }
};

const wasDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

// Nags until invoices have what they need: the business details (the admin
// is walked through them once per session) and the user's own phone number,
// which is printed as the sales rep on what they create - plus their profile
// photo, which the business wants every user to have.
const SetupReminder = ({ user }) => {
  const { data } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await apiClient.get("/business/")).data,
    enabled: Boolean(user),
  });
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [hiddenBar, setHiddenBar] = useState(readHiddenBar);
  const missing = data?.missing || [];
  const own = user ? [!user.phone && "your phone number", !user.avatar_url && "a profile photo"].filter(Boolean) : [];
  if (!missing.length && !own.length) return null;
  const signature = [...missing, ...own].join("|");

  const hideBar = () => {
    setHiddenBar(signature);
    try {
      localStorage.setItem(HIDE_BAR_KEY, signature);
    } catch {
      // Storage blocked - hidden for this session only.
    }
  };

  const later = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode etc. - the prompt just comes back next time.
    }
  };

  return (
    <>
      {hiddenBar !== signature && (
      <div role="status" className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-700">
        <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
        {missing.length > 0 && (
          <span>
            Invoices are missing: {missing.join(", ")}.{" "}
            {user?.is_admin ? (
              <Link to="/settings" className="font-semibold underline">Fill in business details</Link>
            ) : (
              "Ask an admin to fill them in under Settings."
            )}
          </span>
        )}
        {own.length > 0 && (
          <span>
            Add {own.join(" and ")}{!user.phone ? " (your number is printed as the sales rep on your invoices)" : ""}.{" "}
            <Link to="/settings" className="font-semibold underline">My details</Link>
          </span>
        )}
        <button type="button" onClick={hideBar} title="Hide this warning" aria-label="Hide this warning"
          className="ml-auto rounded-md p-1 text-amber-700 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      )}

      <Modal isOpen={Boolean(user?.is_admin) && missing.length > 0 && !dismissed} onClose={later} size="lg"
        title="Set up your business details">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            These are printed on every invoice, quote and purchase order, including where your clients should pay.
            You can change them any time under Settings.
          </p>
          <BusinessSettings canEdit bare />
          <div className="flex justify-start">
            <button type="button" onClick={later} className="text-sm font-medium text-slate-500 hover:text-slate-700">
              I'll do this later
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SetupReminder;
