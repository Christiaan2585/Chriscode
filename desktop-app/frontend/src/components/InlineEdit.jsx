import React, { useRef, useState } from "react";
import { Pencil } from "lucide-react";

// Click-to-edit text. Enter (Ctrl+Enter when multiline) or clicking away
// saves, Escape cancels; an unchanged value isn't sent. `onSave` returns a
// promise - on failure the field stays open with the typed value (the app's
// error toast says why).
const InlineEdit = ({
  value, onSave, label, type = "text", multiline = false, placeholder = "Add…", required = false,
  format = (v) => v, listId, className = "", inputClassName = "",
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const busy = useRef(false);

  const start = () => {
    setDraft(value ?? "");
    setInvalid(false);
    setEditing(true);
  };

  const commit = async () => {
    if (busy.current) return;
    let next = typeof draft === "string" ? draft.trim() : draft;
    if (type === "number") {
      next = next === "" ? null : Number(next);
      if (next !== null && (Number.isNaN(next) || next < 0)) {
        setInvalid(true);
        return;
      }
    }
    if (required && (next === null || next === "")) {
      setInvalid(true);
      return;
    }
    if (String(next ?? "") === String(value ?? "")) {
      setEditing(false);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await onSave(next === "" ? null : next);
      setEditing(false);
    } catch {
      setInvalid(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (editing) {
    const common = {
      autoFocus: true,
      value: draft,
      disabled: saving,
      "aria-label": label,
      "aria-invalid": invalid || undefined,
      "aria-required": required || undefined,
      title: invalid && required ? `${label} is required` : undefined,
      onChange: (e) => { setDraft(e.target.value); setInvalid(false); },
      onBlur: commit,
      onKeyDown,
      className: `w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
        invalid ? "border-red-400" : "border-emerald-400"} ${inputClassName}`,
    };
    return multiline ? (
      <textarea rows={3} {...common} />
    ) : (
      <input type={type === "number" ? "number" : "text"} min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined} list={listId} {...common} />
    );
  }

  const empty = value === null || value === undefined || value === "";
  return (
    <button type="button" onClick={start} title={`Edit ${label.toLowerCase()}`}
      className={`group relative inline-flex max-w-full items-start gap-1 rounded-md px-1 -mx-1 text-left hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${className}`}>
      <span className={`min-w-0 ${type === "number" ? "whitespace-nowrap" : "break-words"} ${empty ? "italic text-slate-400" : ""}`}>{empty ? placeholder : format(value)}</span>
      <Pencil size={12} aria-hidden="true" className="mt-1 shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 group-focus:opacity-100" />
      <span className="sr-only">- click to edit {label.toLowerCase()}</span>
    </button>
  );
};

export default InlineEdit;
