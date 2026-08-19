"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  displayToIso,
  isoToDisplay,
  maskDate,
} from "@/lib/date-field-format";

/**
 * A date input that always reads DD-MM-YY.
 *
 * `<input type="date">` renders its own text from the browser and OS
 * locale, and nothing in CSS or HTML can override it: the same page shows
 * dd-mm-yyyy in Chrome here and mm/dd/yyyy on a US machine. For a system
 * where every other date is printed DD/MM/YY, that inconsistency lands on
 * exactly the field people type into.
 *
 * So the text is ours — a plain text box, masked as the user types — and
 * the native control is kept only for its calendar, opened by the button
 * and otherwise invisible. That keeps the picker (and the mobile date
 * keyboard) without letting the browser decide the format.
 *
 * The value in and out is still an ISO `yyyy-mm-dd` string, so every
 * caller and every API is unchanged.
 */

export function DateInput({
  value,
  onChange,
  className = "",
  min,
  max,
  disabled,
  "aria-label": ariaLabel,
}: {
  /** ISO `yyyy-mm-dd`, or "" for empty. */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const native = useRef<HTMLInputElement>(null);

  // Follow the value when the parent changes it (a form reset, a loaded
  // record) — but not while the field holds a half-typed date, or the
  // mask would fight the person typing it.
  useEffect(() => {
    const shown = displayToIso(text);
    if (shown !== value) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleText(raw: string) {
    const next = maskDate(raw);
    setText(next);
    if (next === "") {
      onChange("");
      return;
    }
    const iso = displayToIso(next);
    // Only publish a complete, real date. Partial input stays local, so a
    // half-typed day never reaches a filter or a save.
    if (iso) onChange(iso);
  }

  const complete = text.length === 8;
  const invalid = complete && displayToIso(text) === null;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={() => {
          // Give back the stored value rather than leaving something
          // unparseable on screen.
          if (displayToIso(text) === null) setText(isoToDisplay(value));
        }}
        placeholder="DD-MM-YY"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={`w-full pr-7 px-2.5 py-1.5 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue ${
          invalid ? "border-brand-red" : "border-ink-200"
        }`}
      />

      {/* The native control, kept only for its calendar. Zero-sized rather
          than display:none, because a hidden input cannot be opened. */}
      <input
        ref={native}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value)}
        className="absolute right-1 w-0 h-0 opacity-0 pointer-events-none"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const el = native.current;
          if (!el) return;
          // showPicker is the supported way in; older browsers get a
          // focus+click, which opens it in most of them.
          if (typeof el.showPicker === "function") el.showPicker();
          else {
            el.focus();
            el.click();
          }
        }}
        aria-label="Open calendar"
        className="absolute right-1.5 p-0.5 text-ink-400 hover:text-brand-blue disabled:opacity-40"
      >
        <CalendarDays size={14} />
      </button>
    </span>
  );
}
