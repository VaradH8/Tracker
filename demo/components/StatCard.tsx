import type { LucideIcon } from "lucide-react";

type Variant = "blue" | "red" | "yellow" | "green";

const VARIANTS: Record<
  Variant,
  { iconBg: string; iconColor: string; ring: string }
> = {
  blue: {
    iconBg: "bg-brand-blueBg",
    iconColor: "text-brand-blue",
    ring: "ring-brand-blue",
  },
  red: {
    iconBg: "bg-brand-redBg",
    iconColor: "text-brand-redText",
    ring: "ring-brand-red",
  },
  yellow: {
    iconBg: "bg-brand-yellowBg",
    iconColor: "text-brand-yellowText",
    ring: "ring-brand-yellow",
  },
  green: {
    iconBg: "bg-brand-greenBg",
    iconColor: "text-brand-greenText",
    ring: "ring-brand-green",
  },
};

export function StatCard({
  label,
  value,
  Icon,
  variant = "blue",
  hint,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  Icon: LucideIcon;
  variant?: Variant;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const v = VARIANTS[variant];
  const interactive = !!onClick;
  const cls = [
    "card p-5 flex items-center gap-4 w-full text-left transition",
    interactive ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "",
    active ? `ring-2 ${v.ring}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
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
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
