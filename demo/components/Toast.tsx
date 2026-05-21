"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

type ToastKind = "success" | "info" | "error";
type ToastAction = { label: string; onClick: () => void };
type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
};

type Ctx = {
  show: (
    message: string,
    kind?: ToastKind,
    action?: ToastAction,
  ) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "success", action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, kind, message, action }]);
      setTimeout(
        () => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        },
        action ? 6000 : 3800,
      );
    },
    [],
  );

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-[320px]">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const tone =
    toast.kind === "success"
      ? { bar: "bg-brand-green", Icon: CheckCircle2, color: "text-brand-green" }
      : toast.kind === "error"
        ? { bar: "bg-brand-red", Icon: AlertTriangle, color: "text-brand-redText" }
        : { bar: "bg-brand-blue", Icon: Info, color: "text-brand-blue" };
  const Icon = tone.Icon;
  return (
    <div className="card p-0 overflow-hidden shadow-lg flex animate-in fade-in slide-in-from-bottom-2">
      <div className={`w-1 shrink-0 ${tone.bar}`} />
      <div className="flex items-start gap-2.5 p-3 flex-1">
        <Icon size={16} className={`${tone.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink-900 leading-snug">{toast.message}</p>
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                onClose();
              }}
              className="mt-1 text-xs font-medium text-brand-blue hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-ink-400 hover:text-ink-700 shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function useToast(): Ctx {
  const c = useContext(ToastCtx);
  return c ?? { show: () => {} };
}
