"use client";

import { useRouter } from "next/navigation";
import {
  CHART,
  barPath,
  colPath,
  fitText,
  niceStep,
  useChart,
  type TipLine,
} from "@/components/charts/ChartKit";
import {
  dayLabel,
  dayNum,
  shortDay,
  type LeaveCell,
  type ProgressRow,
  type TimelineRow,
  type UtilRow,
} from "@/lib/dashboard-metrics";

/* ------------------------------------------------------------------ */
/* Horizontal bars — one series                                         */
/* ------------------------------------------------------------------ */

export function HBarChart({
  rows,
  unit = "",
  color = CHART.accent,
}: {
  rows: { key: string | number; label: string; value: number; tip: TipLine[]; onClick?: () => void }[];
  unit?: string;
  color?: string;
}) {
  const { ref, width, bind, tipNode } = useChart();
  const rowH = 32;
  const bh = 14;
  const labelW = Math.min(170, Math.max(90, width * 0.36));
  const pw = Math.max(0, width - labelW - 60);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const h = rows.length * rowH + 4;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={h} className="block overflow-visible">
          {rows.map((r, i) => {
            const y = i * rowH + 9;
            const w = (r.value / max) * pw;
            return (
              <g key={r.key}>
                <text x={0} y={y + 11} fontSize={12} fill={CHART.ink2}>
                  <title>{r.label}</title>
                  {fitText(r.label, labelW - 10)}
                </text>
                {w > 0 && <path d={barPath(labelW, y, w, bh)} fill={color} pointerEvents="none" />}
                <text x={labelW + w + 6} y={y + 11} fontSize={12} fill={CHART.ink2} pointerEvents="none">
                  {r.value.toLocaleString("en-IN")}
                  {unit}
                </text>
                <rect x={0} y={y - 9} width={width} height={rowH} fill="transparent" {...bind(r.tip, r.onClick)} />
              </g>
            );
          })}
        </svg>
      )}
      {tipNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal stacked bars — a few named segments per row               */
/* ------------------------------------------------------------------ */

export function StackedHBarChart({
  rows,
}: {
  rows: {
    key: string;
    label: string;
    segments: { name: string; value: number; color: string }[];
    tip: TipLine[];
  }[];
}) {
  const { ref, width, bind, tipNode } = useChart();
  const rowH = 32;
  const bh = 14;
  const labelW = Math.min(150, Math.max(84, width * 0.3));
  const pw = Math.max(0, width - labelW - 40);
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0)));
  const h = rows.length * rowH + 4;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={h} className="block overflow-visible">
          {rows.map((r, i) => {
            const y = i * rowH + 9;
            const total = r.segments.reduce((s, x) => s + x.value, 0);
            const visible = r.segments.filter((s) => s.value > 0);
            let x = labelW;
            return (
              <g key={r.key}>
                <text x={0} y={y + 11} fontSize={12} fill={CHART.ink2}>
                  <title>{r.label}</title>
                  {fitText(r.label, labelW - 10)}
                </text>
                {visible.map((s, j) => {
                  const gap = j > 0 ? 2 : 0;
                  const w = (s.value / max) * pw - gap;
                  const x0 = x + gap;
                  x = x0 + w;
                  const last = j === visible.length - 1;
                  return (
                    <path
                      key={s.name}
                      d={last ? barPath(x0, y, w, bh) : `M${x0},${y}H${x0 + w}V${y + bh}H${x0}Z`}
                      fill={s.color}
                      pointerEvents="none"
                    />
                  );
                })}
                <text x={x + 6} y={y + 11} fontSize={12} fill={CHART.ink2} pointerEvents="none">
                  {total}
                </text>
                <rect x={0} y={y - 9} width={width} height={rowH} fill="transparent" {...bind(r.tip)} />
              </g>
            );
          })}
        </svg>
      )}
      {tipNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

export function ColumnChart({
  rows,
  height = 200,
  axis = false,
  valueLabels = "all",
}: {
  rows: { key: string; label: string; value: number; color?: string; tip: TipLine[] }[];
  height?: number;
  /** Draw a y-axis with gridlines (for many columns without value labels). */
  axis?: boolean;
  /** "all" labels every column; "extremes" only the highest and the latest. */
  valueLabels?: "all" | "extremes";
}) {
  const { ref, width, bind, tipNode } = useChart();
  const m = { t: 20, b: 26, l: axis ? 30 : 0 };
  const ph = height - m.t - m.b;
  const top = Math.max(1, ...rows.map((r) => r.value));
  const step = niceStep(top);
  const max = axis ? Math.ceil(top / step) * step : top;
  const pw = Math.max(0, width - m.l);
  const band = rows.length ? pw / rows.length : 0;
  const bw = Math.min(24, band * 0.6);
  const every = band >= 44 ? 1 : Math.ceil(44 / Math.max(1, band));
  const peak = rows.reduce((best, r, i) => (r.value > (rows[best]?.value ?? -1) ? i : best), 0);
  const y = (v: number) => m.t + ph * (1 - v / max);

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          {axis &&
            Array.from({ length: max / step + 1 }, (_, i) => i * step).map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={CHART.muted}>
                  {t}
                </text>
              </g>
            ))}
          {!axis && <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={CHART.axis} />}
          {rows.map((r, i) => {
            const cx = m.l + band * i + band / 2;
            const showValue = valueLabels === "all" || (r.value > 0 && (i === peak || i === rows.length - 1));
            return (
              <g key={r.key}>
                <path d={colPath(cx - bw / 2, y(r.value), bw, y(0) - y(r.value))} fill={r.color ?? CHART.accent} pointerEvents="none" />
                {showValue && (
                  <text x={cx} y={y(r.value) - 6} textAnchor="middle" fontSize={11.5} fill={CHART.ink2} pointerEvents="none">
                    {r.value}
                  </text>
                )}
                {i % every === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART.muted} pointerEvents="none">
                    {r.label}
                  </text>
                )}
                <rect x={m.l + band * i} y={m.t - 16} width={band} height={ph + 16} fill="transparent" {...bind(r.tip)} />
              </g>
            );
          })}
        </svg>
      )}
      {tipNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Utilization bullets                                                 */
/* ------------------------------------------------------------------ */

export function UtilizationChart({ rows }: { rows: UtilRow[] }) {
  const { ref, width, bind, tipNode } = useChart();
  const rowH = 34;
  const labelW = 84;
  const valW = 104;
  const pw = Math.max(0, width - labelW - valW);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.capacity, r.hours))) * 1.04;
  const sx = (v: number) => (v / max) * pw;
  const h = rows.length * rowH + 4;

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={h} className="block overflow-visible">
          {rows.map((r, i) => {
            const y = i * rowH + 10;
            const within = Math.min(r.hours, r.capacity);
            const over = Math.max(0, r.hours - r.capacity);
            const pct = Math.round(r.ratio * 100);
            return (
              <g key={r.id}>
                <text x={0} y={y + 10} fontSize={12} fill={CHART.ink2}>
                  {r.name}
                </text>
                <rect x={labelW} y={y} width={sx(r.capacity)} height={12} rx={2} fill={CHART.track} pointerEvents="none" />
                {within > 0 && (
                  <path
                    d={over > 0 ? `M${labelW},${y}H${labelW + sx(within)}V${y + 12}H${labelW}Z` : barPath(labelW, y, sx(within), 12)}
                    fill={CHART.accent}
                    pointerEvents="none"
                  />
                )}
                {over > 0 && (
                  <path d={barPath(labelW + sx(r.capacity) + 2, y, Math.max(0, sx(over) - 2), 12)} fill={CHART.critical} pointerEvents="none" />
                )}
                <rect x={labelW + sx(r.capacity) - 1} y={y - 4} width={2} height={20} fill={CHART.ink3} pointerEvents="none" />
                <text x={width} y={y + 10} textAnchor="end" fontSize={12} fill={over > 0 ? CHART.ink : CHART.ink3} fontWeight={over > 0 ? 600 : 400} pointerEvents="none">
                  {r.hours}h · {pct}%
                </text>
                <rect
                  x={0}
                  y={y - 10}
                  width={width}
                  height={rowH}
                  fill="transparent"
                  {...bind([
                    { text: r.name },
                    { text: `${r.hours}h logged · ${pct}% of capacity`, strong: true },
                    { text: `Weekly capacity ${r.capacity}h` },
                  ])}
                />
              </g>
            );
          })}
        </svg>
      )}
      {tipNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress vs budget used — dumbbell per project                      */
/* ------------------------------------------------------------------ */

export function ProgressBudgetChart({ rows }: { rows: ProgressRow[] }) {
  const router = useRouter();
  const { ref, width, bind, tipNode } = useChart();
  const head = 20;
  const rowH = 34;
  const labelW = Math.min(200, Math.max(110, width * 0.3));
  const noteW = 92;
  const pw = Math.max(0, width - labelW - noteW - 10);
  const maxRatio = Math.max(1, ...rows.map((r) => r.budgetUsed ?? 0));
  const scale = Math.min(2, Math.ceil(maxRatio * 4) / 4);
  const sx = (v: number) => labelW + (Math.min(v, scale) / scale) * pw;
  const ticks = Array.from({ length: Math.round(scale / 0.25) + 1 }, (_, i) => i * 0.25).filter(
    (t) => pw / (scale / 0.25) >= 34 || t % 0.5 === 0,
  );
  const h = head + rows.length * rowH + 4;

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={h} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={head - 4} y2={h} stroke={t === 1 ? CHART.axis : CHART.grid} />
              <text x={sx(t)} y={11} textAnchor="middle" fontSize={11} fill={CHART.muted}>
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = head + i * rowH + rowH / 2;
            const xp = sx(r.progress);
            const xb = r.budgetUsed === null ? null : sx(r.budgetUsed);
            const gapPts = r.budgetUsed === null ? null : Math.round((r.budgetUsed - r.progress) * 100);
            const tip: TipLine[] = [
              { text: r.name },
              { text: `${Math.round(r.progress * 100)}% of tasks done (${r.done}/${r.total})`, strong: true },
              {
                text:
                  r.budgetUsed === null
                    ? "No budget set"
                    : `${Math.round(r.budgetUsed * 100)}% of budgeted hours used`,
                strong: r.budgetUsed !== null,
              },
            ];
            return (
              <g key={r.projectId}>
                <text x={0} y={y + 4} fontSize={12} fill={CHART.ink2}>
                  <title>{r.name}</title>
                  {fitText(r.name, labelW - 12)}
                </text>
                {xb !== null && (
                  <line x1={Math.min(xp, xb)} x2={Math.max(xp, xb)} y1={y} y2={y} stroke={CHART.deemph} strokeWidth={2} pointerEvents="none" />
                )}
                {xb !== null && (
                  <rect x={xb - 5} y={y - 5} width={10} height={10} rx={2} fill={CHART.ink3} stroke={CHART.surface} strokeWidth={2} pointerEvents="none" />
                )}
                <circle cx={xp} cy={y} r={5.5} fill={CHART.accent} stroke={CHART.surface} strokeWidth={2} pointerEvents="none" />
                <text
                  x={width}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={11.5}
                  fill={gapPts !== null && gapPts >= 20 ? "#C5221F" : CHART.ink3}
                  fontWeight={gapPts !== null && gapPts >= 20 ? 600 : 400}
                  pointerEvents="none"
                >
                  {gapPts === null ? "No budget" : gapPts >= 20 ? `▲ ${gapPts} pts over` : gapPts > 0 ? `+${gapPts} pts` : "On pace"}
                </text>
                <rect
                  x={0}
                  y={y - rowH / 2}
                  width={width}
                  height={rowH}
                  fill="transparent"
                  {...bind(tip, () => router.push(`/projects/${r.projectId}`))}
                />
              </g>
            );
          })}
        </svg>
      )}
      {tipNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Project timeline — planned window, time elapsed, days past target    */
/* ------------------------------------------------------------------ */

export function ProjectTimelineChart({ rows, today }: { rows: TimelineRow[]; today: string }) {
  const router = useRouter();
  const { ref, width, bind, tipNode } = useChart();
  const labelW = Math.min(200, Math.max(110, width * 0.28));
  const noteW = 96;
  const head = 22;
  const rowH = 34;
  const h = head + rows.length * rowH + 4;
  const t0 = dayNum(today);
  const d0 = Math.min(t0 - 7, ...rows.map((r) => dayNum(r.start))) - 3;
  const d1 = Math.max(t0 + 14, ...rows.map((r) => dayNum(r.target))) + 5;
  const pw = Math.max(0, width - labelW - noteW);
  const sx = (d: number) => labelW + ((d - d0) / Math.max(1, d1 - d0)) * pw;

  const spanMonths = (d1 - d0) / 30;
  const every = spanMonths > 14 ? 3 : spanMonths > 7 ? 2 : 1;
  const ticks: { d: number; label: string }[] = [];
  const c = new Date(d0 * 86_400_000);
  c.setUTCDate(1);
  c.setUTCMonth(c.getUTCMonth() + 1);
  while (c.getTime() / 86_400_000 < d1) {
    if (c.getUTCMonth() % every === 0) {
      ticks.push({
        d: c.getTime() / 86_400_000,
        label: c.toLocaleDateString("en-GB", {
          month: "short",
          timeZone: "UTC",
          ...(c.getUTCMonth() === 0 ? { year: "2-digit" } : {}),
        }),
      });
    }
    c.setUTCMonth(c.getUTCMonth() + 1);
  }

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={h} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t.d}>
              <line x1={sx(t.d)} x2={sx(t.d)} y1={head - 6} y2={h} stroke={CHART.grid} />
              {Math.abs(sx(t.d) + 16 - sx(t0)) > 44 && (
                <text x={sx(t.d) + 4} y={12} fontSize={11} fill={CHART.muted}>
                  {t.label}
                </text>
              )}
            </g>
          ))}
          <line x1={sx(t0)} x2={sx(t0)} y1={head - 6} y2={h} stroke={CHART.ink3} strokeWidth={1.5} />
          <text x={sx(t0)} y={12} textAnchor="middle" fontSize={11} fill={CHART.ink2} fontWeight={500}>
            Today
          </text>
          {rows.map((r, i) => {
            const y = head + i * rowH + rowH / 2;
            const s = dayNum(r.start);
            const e = dayNum(r.target);
            const xs = sx(s);
            const xe = sx(e);
            const xNow = sx(Math.min(Math.max(t0, s), e));
            const started = t0 > s;
            const late = r.daysLate > 0;
            const note = late
              ? `${r.daysLate}d past target`
              : !started
                ? `Starts in ${s - t0}d`
                : `${r.daysLeft}d left`;
            return (
              <g key={r.projectId}>
                <text x={0} y={y + 4} fontSize={12} fill={CHART.ink2}>
                  <title>{r.name}</title>
                  {fitText(r.name, labelW - 12)}
                </text>
                <rect x={xs} y={y - 6} width={Math.max(4, xe - xs)} height={12} rx={3} fill={CHART.track} pointerEvents="none" />
                {started && xNow > xs && (
                  <path
                    d={late ? `M${xs + 3},${y - 6}H${xNow}V${y + 6}H${xs + 3}Q${xs},${y + 6} ${xs},${y + 3}V${y - 3}Q${xs},${y - 6} ${xs + 3},${y - 6}Z` : barPath(xs, y - 6, xNow - xs, 12, 3)}
                    fill={r.status === "On Hold" ? CHART.deemph : CHART.accent}
                    pointerEvents="none"
                  />
                )}
                {late && (
                  <path d={barPath(xe + 2, y - 6, Math.max(0, sx(t0) - xe - 2), 12, 3)} fill={CHART.critical} pointerEvents="none" />
                )}
                <text x={width} y={y + 4} textAnchor="end" fontSize={11.5} fill={late ? "#C5221F" : CHART.ink3} fontWeight={late ? 600 : 400} pointerEvents="none">
                  {note}
                </text>
                <rect
                  x={0}
                  y={y - rowH / 2}
                  width={width}
                  height={rowH}
                  fill="transparent"
                  {...bind(
                    [
                      { text: `${r.name} · ${r.status}` },
                      { text: `${shortDay(r.start)} → ${shortDay(r.target)}`, strong: true },
                      { text: note },
                    ],
                    () => router.push(`/projects/${r.projectId}`),
                  )}
                />
              </g>
            );
          })}
        </svg>
      )}
      {tipNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leave grid — people × next working days                              */
/* ------------------------------------------------------------------ */

export function LeaveGrid({
  days,
  rows,
}: {
  days: string[];
  rows: { name: string; fullName: string; cells: LeaveCell[] }[];
}) {
  const { ref, width, bind, tipNode } = useChart();
  const labelW = 84;
  const head = 22;
  const rowH = 30;
  const cw = days.length ? Math.max(0, width - labelW) / days.length : 0;
  const h = head + rows.length * rowH;
  const fill = (c: LeaveCell) => (c === "approved" ? CHART.accent : c === "pending" ? CHART.ordinal[0] : "#F1F3F4");

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={h} className="block overflow-visible">
          {days.map((d, j) =>
            cw >= 40 || j % 2 === 0 ? (
              <text key={d} x={labelW + cw * j + cw / 2} y={13} textAnchor="middle" fontSize={10.5} fill={CHART.muted}>
                {dayLabel(d)}
              </text>
            ) : null,
          )}
          {rows.map((r, i) => {
            const y = head + i * rowH;
            return (
              <g key={r.fullName}>
                <text x={0} y={y + 19} fontSize={12} fill={CHART.ink2}>
                  {r.name}
                </text>
                {r.cells.map((c, j) => (
                  <rect
                    key={j}
                    x={labelW + cw * j + 1}
                    y={y + 2}
                    width={Math.max(0, cw - 2)}
                    height={rowH - 4}
                    rx={3}
                    fill={fill(c)}
                    {...bind([
                      { text: `${r.fullName} · ${dayLabel(days[j])}` },
                      { text: c === "approved" ? "On leave" : c === "pending" ? "Leave requested (pending)" : "Available", strong: true },
                    ])}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      )}
      {tipNode}
    </div>
  );
}
