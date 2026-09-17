"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

/**
 * Small SVG chart toolkit for the dashboard: palette, measured width,
 * one tooltip per chart (hover + keyboard focus), card chrome with a
 * "View data" table, and bar paths with a rounded data end.
 */

/** Marks use the app palette; ramps were checked for colour-blind safety. */
export const CHART = {
  accent: "#1A73E8",
  track: "#D2E3FC",
  deemph: "#9AA0A6",
  good: "#34A853",
  warning: "#F9AB00",
  critical: "#EA4335",
  grid: "#ECEDEF",
  axis: "#C4C7CC",
  ink: "#202124",
  ink2: "#3C4043",
  ink3: "#5F6368",
  muted: "#80868B",
  surface: "#FFFFFF",
  /** Ordered categories (e.g. overdue age), light → dark. */
  ordinal: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"],
} as const;

export type TipLine = { text: string; strong?: boolean };

/** Measured width + a tooltip anchored to the same wrapper element. */
export function useChart() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; lines: TipLine[] } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const bind = useCallback(
    (lines: TipLine[], onClick?: () => void) => ({
      tabIndex: 0,
      role: onClick ? "button" : undefined,
      "aria-label": lines.map((l) => l.text).join(", "),
      style: { outline: "none", cursor: onClick ? "pointer" : "default" } as const,
      onClick,
      onKeyDown: onClick
        ? (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick();
            }
          }
        : undefined,
      onPointerMove: (e: PointerEvent<SVGElement>) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines });
      },
      onPointerLeave: () => setTip(null),
      onFocus: (e: FocusEvent<SVGElement>) => {
        const r = ref.current?.getBoundingClientRect();
        const b = e.currentTarget.getBoundingClientRect();
        if (r) setTip({ x: b.left - r.left + b.width / 2, y: b.top - r.top, lines });
      },
      onBlur: () => setTip(null),
    }),
    [],
  );

  const tipNode = tip ? (
    <div
      className="absolute z-20 pointer-events-none rounded bg-ink-900 text-white text-xs px-2.5 py-1.5 shadow-lg whitespace-nowrap"
      style={{
        left: tip.x > width - 180 ? undefined : tip.x + 12,
        right: tip.x > width - 180 ? width - tip.x + 12 : undefined,
        top: tip.y + 14,
      }}
    >
      {tip.lines.map((l, i) => (
        <div key={i} className={l.strong ? "font-semibold" : "text-ink-200"}>
          {l.text}
        </div>
      ))}
    </div>
  ) : null;

  return { ref, width, bind, tipNode };
}

/** Column with a rounded top, square at the baseline. */
export function colPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Horizontal bar with a rounded right end, square at the baseline. */
export function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0 || h <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

/** Trim a label to roughly fit `px` at 12px Poppins. */
export function fitText(s: string, px: number): string {
  const max = Math.max(4, Math.floor(px / 6.8));
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function niceStep(max: number): number {
  if (max <= 5) return 1;
  if (max <= 12) return 2;
  if (max <= 30) return 5;
  if (max <= 60) return 10;
  if (max <= 150) return 25;
  return Math.ceil(max / 5 / 50) * 50;
}

export function LegendItem({
  color,
  kind = "rect",
  label,
}: {
  color: string;
  kind?: "rect" | "line" | "tick" | "dot";
  label: string;
}) {
  const style =
    kind === "line"
      ? { width: 14, height: 2, borderRadius: 1 }
      : kind === "tick"
        ? { width: 2, height: 12 }
        : kind === "dot"
          ? { width: 10, height: 10, borderRadius: 999 }
          : { width: 10, height: 10, borderRadius: 2 };
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="inline-block" style={{ ...style, background: color }} />
      {label}
    </span>
  );
}

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  className = "",
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  table?: { head: string[]; rows: (string | number)[][] };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card p-5 flex flex-col gap-3 min-w-0 ${className}`}>
      <div>
        <h2 className="font-heading text-base font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">{legend}</div>
      )}
      {children}
      {table && table.rows.length > 0 && (
        <details className="text-xs text-ink-500 mt-auto">
          <summary className="cursor-pointer w-fit hover:text-ink-700">View data</summary>
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  {table.head.map((h) => (
                    <th key={h} className="text-left font-medium text-ink-500 pr-4 py-1 border-b border-ink-100">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className="pr-4 py-1 text-ink-700 tabular-nums border-b border-ink-100 whitespace-nowrap">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
