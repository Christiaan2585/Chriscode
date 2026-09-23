import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Info, X } from "lucide-react";

// A tiny, dependency-free toast system. Its whole purpose is to fix the
// single biggest UX gap in this app: almost every failed save/update/delete
// used to just stop its spinner and go quiet, with nothing on screen telling
// the user it didn't work. Rather than hand-adding an onError handler to
// every mutation on every page, api/client.js's response interceptor calls
// showToast(...) directly (see setErrorNotifier below) - so this one file
// gives every existing and future API call automatic, visible error
// reporting, with zero changes needed on the page that made the call.

const ToastContext = createContext(null);

const ICONS = {
  error: AlertTriangle,
  success: CheckCircle,
  info: Info,
};

const STYLES = {
  error: "bg-red-50 border-red-200 text-red-700",
  success: "bg-emerald-50 border-emerald-200 text-emerald-700",
  info: "bg-slate-50 border-slate-200 text-slate-700",
};

let idCounter = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback(
    (message, type = "error", durationMs = 6000) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      timers.current[id] = setTimeout(() => dismiss(id), durationMs);
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              role="alert"
              className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg ${STYLES[t.type] || STYLES.info}`}
            >
              <Icon size={18} className="shrink-0 mt-0.5" />
              <p className="text-sm flex-1">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return ctx;
};
