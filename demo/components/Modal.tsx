"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Shared modal shell. Every form dialog in the app uses this so they behave
 * the same way: a title with a close (X) button, Escape-to-close, and a
 * dialog role for assistive tech. Backdrop clicks intentionally do NOT close
 * the modal — these all hold form input we don't want to lose to a misclick.
 */
export function Modal({
  title,
  onClose,
  size = "md",
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`card w-full ${
          size === "lg" ? "max-w-lg" : "max-w-md"
        } p-6 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 -m-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
