"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Promise-based confirm dialog that replaces window.confirm() — same
 * one-call mental model, but styled to match the rest of the app and
 * with separate "primary" and "danger" tones so a delete button
 * doesn't look identical to a cancel-leave button.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Delete project?",
 *     body: "Every task, remark, time log on this project goes too.",
 *     confirmLabel: "Delete project",
 *     danger: true,
 *   });
 *   if (!ok) return;
 */

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Ctx = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<Ctx | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  // One resolver at a time — confirms are modal and serial.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Ctx>(async (next) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(next);
    });
  }, []);

  function close(result: boolean) {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOpts(null);
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/40 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-md card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className={
                  opts.danger
                    ? "w-9 h-9 rounded-full bg-brand-redBg text-brand-redText grid place-items-center shrink-0"
                    : "w-9 h-9 rounded-full bg-brand-blueBg text-brand-blue grid place-items-center shrink-0"
                }
              >
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-heading text-base font-semibold text-ink-900">
                  {opts.title}
                </h2>
                {opts.body && (
                  <p className="text-sm text-ink-700 mt-1 leading-relaxed">
                    {opts.body}
                  </p>
                )}
              </div>
              <button
                onClick={() => close(false)}
                className="p-1 -m-1 text-ink-400 hover:text-ink-700"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => close(false)}
                className="btn-ghost border border-ink-200"
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                className={
                  opts.danger
                    ? "btn-ghost bg-brand-red text-white hover:bg-brand-redText"
                    : "btn-primary"
                }
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): Ctx {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) {
    throw new Error(
      "useConfirm must be used within ConfirmDialogProvider (see app/layout.tsx)",
    );
  }
  return ctx;
}
