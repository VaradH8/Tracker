import type { LucideIcon } from "lucide-react";

type Variant = "blue" | "red" | "yellow" | "green";

const VARIANTS: Record<Variant, { iconBg: string; iconColor: string }> = {
  blue: { iconBg: "bg-brand-blueBg", iconColor: "text-brand-blue" },
  red: { iconBg: "bg-brand-redBg", iconColor: "text-brand-redText" },
  yellow: { iconBg: "bg-brand-yellowBg", iconColor: "text-brand-yellowText" },
  green: { iconBg: "bg-brand-greenBg", iconColor: "text-brand-greenText" },
};

export function StatCard({
  label,
  value,
  Icon,
  variant = "blue",
  hint,
}: {
  label: string;
  value: number | string;
  Icon: LucideIcon;
  variant?: Variant;
  hint?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <div className="card p-5 flex items-center gap-4">
      <div
        className={`w-10 h-10 rounded-card grid place-items-center ${v.iconBg} ${v.iconColor}`}
      >
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink-500 font-medium">{label}</div>
        <div className="font-heading font-semibold text-2xl text-ink-900 leading-tight">
          {value}
        </div>
        {hint && <div className="text-xs text-ink-500 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}
