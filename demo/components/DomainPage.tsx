"use client";

import type { ReactNode } from "react";

/**
 * One page frame for the whole Domain module, so every screen has the same
 * header rhythm and the same measure.
 *
 * Two widths, deliberately only two:
 *   wide   — data screens (dashboards, tables, boards) fill the shell.
 *   narrow — forms and single-column reading, capped so a password field
 *            doesn't stretch to 1300px.
 *
 * Narrow pages are capped AND centred, header included, so the column sits
 * balanced in the shell instead of hugging the left edge with dead space
 * beside it.
 */
export function DomainPage({
  width = "wide",
  children,
}: {
  width?: "wide" | "narrow";
  children: ReactNode;
}) {
  return (
    <div className={width === "narrow" ? "max-w-[880px] mx-auto" : ""}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  /** Right-hand controls — refresh, primary action, and so on. */
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold text-ink-900">
          {title}
        </h1>
        {description && (
          // Capped measure: full-width prose across 1360px is unreadable.
          <p className="text-sm text-ink-500 mt-1 max-w-3xl">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}
