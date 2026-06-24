"use client";

import { useState, type ReactNode } from "react";

/**
 * A destructive button with a lightweight two-step confirm — first click
 * arms it ("Sure?"), second click fires. Avoids the native confirm()
 * dialog while staying tiny enough to drop in anywhere.
 */
export function ConfirmButton({
  onConfirm,
  children,
  className,
  title,
  confirmLabel = "Sure?",
}: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          className="text-xs font-medium text-brand-redText hover:underline"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="text-xs text-ink-400 hover:text-ink-700"
        >
          cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      className={className}
      title={title}
    >
      {children}
    </button>
  );
}