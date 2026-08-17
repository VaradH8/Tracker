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

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * The house date format: DD/MM/YY.
 *
 * Written out by hand rather than through toLocaleDateString, because the
 * locale decides the field order — the same date renders 22/08/26 for one
 * viewer and 8/22/26 for another, and "08/09/26" is then genuinely
 * ambiguous between August and September. A fixed order is the whole
 * point of asking for a complete format.
 *
 * The year is always present. It used to be dropped inside the current
 * year, which is what let a project running two years late render as
 * "Handover 30 Nov · Projected 15 Sep" and read as early.
 */
function dmy(d: Date, utc: boolean): string {
  const day = utc ? d.getUTCDate() : d.getDate();
  const month = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const year = (utc ? d.getUTCFullYear() : d.getFullYear()) % 100;
  return `${p2(day)}/${p2(month)}/${p2(year)}`;
}

/** 24-hour clock, so 08:30 and 20:30 can never be confused. */
function hm(d: Date): string {
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/**
 * "22/08/26" — the default for anything read as a deadline or a
 * milestone. Day keys are UTC midnight, so they are read back in UTC;
 * reading them locally would shift the date by a day for anyone west of
 * Greenwich.
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dmy(d, true);
}

/**
 * "Sat 22/08/26" — for day-by-day logs, where the weekday is what people
 * actually navigate by.
 */
export function fmtWeekday(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const wd = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  return `${wd} ${dmy(d, true)}`;
}

/**
 * A full timestamp — "22/08/26 16:32". Used where the time of day carries
 * meaning, such as when a submission was reviewed.
 *
 * Unlike a day key this is a real instant, so it is rendered in the
 * viewer's own timezone. Every caller is a client component, so that is
 * the reader's wall clock rather than the server's.
 */
export function fmtStamp(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return "—";
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return "—";
  return `${dmy(d, false)} ${hm(d)}`;
}
