/**
 * Date rendering for the Engineering module. Pure and dependency-free, so
 * both server routes and client components use the same one.
 *
 * There were thirteen of these before, defined locally in thirteen files:
 * four printed the year, nine did not, two prefixed a weekday. The same
 * date therefore looked different depending on which screen you were on,
 * and the omission was not merely cosmetic — the KPI table rendered
 * "Handover 30 Nov · Projected 15 Sep" for a project running two years
 * late, which reads as landing early.
 *
 * The rule here removes that whole class of mistake: the year is shown
 * whenever it is not the current one. Everyday dates stay short, and a
 * date in another year can never be mistaken for a nearby one.
 */

/**
 * Chip colours for a submission's review state. Approvals and My tags had
 * identical copies of this; two copies of a colour mapping drift, and a
 * status that is green on one screen and amber on another is worse than
 * an ugly one. Task status is a different vocabulary and keeps its own.
 */
export function submissionStatusCls(status: string): string {
  if (status === "Approved") return "bg-brand-greenBg text-brand-greenText";
  if (status === "Rejected") return "bg-brand-redBg text-brand-redText";
  return "bg-brand-yellowBg text-brand-yellowText";
}

/** Dates are stored as UTC midnight day keys; parse them the same way. */
function parse(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function needsYear(d: Date): boolean {
  return d.getUTCFullYear() !== new Date().getUTCFullYear();
}

/**
 * "14 Aug", or "14 Aug 2028" when the date falls outside the current year.
 * The default for anything a person reads as a deadline or a milestone.
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(needsYear(d) ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}

/**
 * "Thu 14 Aug" — for day-by-day logs, where the weekday is what people
 * actually navigate by. Same year rule.
 */
export function fmtWeekday(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(needsYear(d) ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}

/**
 * A full timestamp — "14 Aug, 16:32". Used where the time of day carries
 * meaning, such as when a submission was reviewed.
 */
export function fmtStamp(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return "—";
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    ...(needsYear(d) ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}
