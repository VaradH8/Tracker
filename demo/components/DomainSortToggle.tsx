"use client";

/**
 * Newest first, or oldest first.
 *
 * Two buttons rather than a select: there are exactly two answers, and
 * which one is on is worth seeing without opening anything.
 *
 * Shared by every task list rather than living on the one screen that
 * asked for it first. A sort that works on History and not on My tasks is
 * the kind of inconsistency people read as a bug in whichever screen they
 * happened to try second.
 */

export type TaskSort = "new" | "old";

const OPTIONS: [TaskSort, string][] = [
  ["new", "Newest first"],
  ["old", "Oldest first"],
];

export function DomainSortToggle({
  value,
  onChange,
  label = "Show",
}: {
  value: TaskSort;
  onChange: (v: TaskSort) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-ink-500">{label}</span>
      {OPTIONS.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
            value === key
              ? "bg-brand-blueBg text-brand-blue border-brand-blue"
              : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
