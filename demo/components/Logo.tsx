import { palette } from "@/lib/design-tokens";

const COLORS = [
  palette.brand.blue,
  palette.brand.red,
  palette.brand.yellow,
  palette.brand.green,
];

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dot =
    size === "lg" ? "w-3 h-3" : size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <span
            key={c}
            className={`block ${dot} rounded-full`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <span className={`font-heading font-semibold ${text} ml-1`}>
        Task Manager
      </span>
    </div>
  );
}
