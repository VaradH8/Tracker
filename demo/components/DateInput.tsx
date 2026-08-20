"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  displayToIso,
  isoToDisplay,
  maskDate,
} from "@/lib/date-field-format";
import { dateClass } from "@/lib/domain-ui";

/**
 * A date input that always reads DD-MM-YY.
 *
 * `<input type="date">` renders its own text from the browser and OS
 * locale, and nothing in CSS or HTML can override it: the same field
 * shows dd-mm-yyyy in Chrome here and mm/dd/yyyy on a US machine. In a
 * system that prints DD/MM/YY everywhere else, that inconsistency lands
 * on exactly the control people type into.
 *
 * So the text is ours — a plain text box, masked as it is typed — and the
 * native control is kept only for its calendar, opened by the button and
 * otherwise invisible. That keeps the picker and the mobile date keyboard
 * without letting the browser choose the format.
 *
 * The value in and out is still an ISO `yyyy-mm-dd` string, so every
 * caller and every endpoint is unchanged.
 *
 * `className` styles the INPUT, not the wrapper. The first version put it
 * on the wrapper while the input carried its own border and padding,
 * which produced a bordered box inside a bordered box: doubled padding,
 * two rounded outlines, and the calendar icon crushed against the outer
 * edge. The wrapper now does nothing but position the button.
 */
export function DateInput({
  value,
  onChange,
  className,
  min,
  max,
  disabled,
  "aria-label": ariaLabel,
}: {
  /** ISO `yyyy-mm-dd`, or "" for empty. */
  value: string;
  onChange: (iso: string) => void;
  /** Applied to the input. Defaults to the standard field box. */
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const native = useRef<HTMLInputElement>(null);

  // Follow the value when the parent changes it (a form reset, a record
  // loading) — but not while the box holds a half-typed date, or the mask
  // would fight whoever is typing it.
  useEffect(() => {
    if (displayToIso(text) !== value) setText(isoToDisplay(value));
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
    // Only a complete, real date is published. Partial input stays local,
    // so a half-typed day never reaches a filter or a save.
    if (iso) onChange(iso);
  }

  const invalid = text.length === 8 && displayToIso(text) === null;

  return (
    // Only positioning lives here. `w-full` so the field fills whatever
    // the caller laid out, exactly as a bare input would have.
    <span className="relative block w-full">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={() => {
          // Hand back the stored value rather than leaving something
          // unparseable on screen.
          if (displayToIso(text) === null) setText(isoToDisplay(value));
        }}
        placeholder="DD-MM-YY"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        // pr-9 reserves the icon's column so the two never share space.
        className={`${className ?? dateClass("md")} w-full pr-9 ${
          invalid ? "border-brand-red focus:border-brand-red" : ""
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
        className="absolute right-2 top-1/2 w-0 h-0 opacity-0 pointer-events-none"
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
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded text-ink-400 hover:text-brand-blue hover:bg-ink-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <CalendarDays size={15} />
      </button>
    </span>
  );
}
