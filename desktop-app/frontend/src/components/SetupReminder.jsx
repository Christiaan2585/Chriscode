import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import BusinessSettings from "./BusinessSettings";

const DISMISS_KEY = "sandveld_setup_later";

const wasDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

// Nags until invoices have what they need: the business details (the admin
// is walked through them once per session) and the user's own phone number,
// which is printed as the sales rep on what they create.
const SetupReminder = ({ user }) => {
  const { data } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await apiClient.get("/business/")).data,
    enabled: Boolean(user),
  });
  const [dismissed, setDismissed] = useState(wasDismissed);
  const missing = data?.missing || [];
  const needsPhone = Boolean(user) && !user.phone;
  if (!missing.length && !needsPhone) return null;

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
      <div role="status" className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-amber-200 bg-amber-50 px-8 py-2 text-sm text-amber-700">
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
        {needsPhone && (
          <span>
            Add your phone number, printed as the sales rep on your invoices.{" "}
            <Link to="/settings" className="font-semibold underline">My details</Link>
          </span>
        )}
      </div>

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
