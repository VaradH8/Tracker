import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  Icon,
  title,
  message,
  action,
  compact = false,
}: {
  Icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "text-center py-8" : "text-center py-14"}>
      <div className="w-12 h-12 mx-auto rounded-full bg-ink-100 grid place-items-center mb-3">
        <Icon size={22} className="text-ink-400" />
      </div>
      <h3 className="font-heading font-semibold text-ink-900 mb-1">
        {title}
      </h3>
      <p className="text-sm text-ink-500 max-w-sm mx-auto">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
