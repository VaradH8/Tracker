const COLORS = ["#1A73E8", "#EA4335", "#F9AB00", "#34A853"];

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
        Project Tracker
      </span>
    </div>
  );
}
