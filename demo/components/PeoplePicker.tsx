"use client";

import { useId } from "react";

/**
 * Multi-select pill picker for first names. Used wherever the UI needs
 * "pick zero or more people" — project create / edit modals, the per-role
 * team lanes on the project detail page, etc.
 *
 * Renders as a row of pills (selected = filled blue, unselected = bordered
 * grey). Click toggles. Same component for "Leads", "Coordinators",
 * "Developers", "BDs" — caller just passes the candidate list.
 */
export function PeoplePicker({
  candidates,
  selected,
  onToggle,
  label,
  emptyHint,
}: {
  candidates: string[];
  selected: string[];
  onToggle: (name: string) => void;
  label?: string;
  emptyHint?: string;
}) {
  // A title for the group of toggle buttons, not a <label>: there is no
  // single field for it to label. Several pickers share a page, hence useId.
  const titleId = useId();
  if (candidates.length === 0) {
    return (
      <div>
        {label && (
          <p className="block text-xs font-medium text-ink-700 mb-1.5">
            {label}
          </p>
        )}
        <p className="text-xs text-ink-400 italic">
          {emptyHint ?? "No people available. Add users in Admin → Users."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <p id={titleId} className="block text-xs font-medium text-ink-700 mb-1.5">
          {label}{" "}
          {selected.length > 0 && (
            <span className="text-ink-400 font-normal">
              · {selected.length} selected
            </span>
          )}
        </p>
      )}
      <div
        role="group"
        aria-labelledby={label ? titleId : undefined}
        className="flex flex-wrap gap-1.5 p-2 rounded border border-ink-200 bg-ink-50"
      >
        {candidates.map((n) => {
          const on = selected.includes(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(n)}
              className={
                on
                  ? "inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-pill bg-brand-blue text-white text-xs font-medium"
                  : "inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-pill bg-white border border-ink-200 text-ink-700 hover:bg-ink-100 text-xs font-medium"
              }
            >
              {on && (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
