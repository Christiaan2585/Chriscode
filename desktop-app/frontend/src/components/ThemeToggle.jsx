import React from "react";
import { Moon, Sun } from "lucide-react";
import { setTheme } from "../utils/theme";
import { useAppearance } from "../utils/useAppearance";

const ThemeToggle = () => {
  const { mode } = useAppearance(); // stays in step with the Appearance settings
  const isDark = mode === "dark";

  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600"
    >
      <Sun size={16} />
      <span className={`relative w-9 h-5 rounded-full transition-colors ${isDark ? "bg-emerald-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#fff] transition-transform ${isDark ? "translate-x-4" : ""}`} />
      </span>
      <Moon size={16} />
    </button>
  );
};

export default ThemeToggle;
