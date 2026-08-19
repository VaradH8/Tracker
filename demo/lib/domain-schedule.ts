import { prisma } from "@/lib/db";
import {
  DEFAULT_WORK_WEEK,
  MAX_WORKING_DAYS,
  handoverFrom,
  isValidISODate,
  isWorkWeek,
  type WorkWeek,
} from "@/lib/domain-workdays";

/**
 * Server-side resolution of a project's schedule.
 *
 * The browser previews the handover date as you type, but it never gets
 * to decide it: the date goes to a client, and a figure a client relies
 * on cannot come from a form that anyone could edit. When a request
 * supplies a working-day count, the date is recomputed here and whatever
 * the client sent is discarded.
 *
 * Both ways of setting the date remain valid, which is the point of
 * keeping the inputs nullable:
 *   - derived — start date + working week + total working days
 *   - direct  — a handover date typed in, as before this existed
 */

/** Every public holiday, as ISO `yyyy-mm-dd`. */
export async function holidaySet(): Promise<Set<string>> {
  const rows = await prisma.domainHoliday.findMany({ select: { date: true } });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}

/** Midnight UTC of a calendar day — how every date column here is stored. */
export function dayToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export type ResolvedSchedule = {
  startDate: Date | null;
  handoverDate: Date | null;
  workingDaysPerWeek: number | null;
  totalWorkingDays: number | null;
};

export type ScheduleOutcome =
  | { ok: true; value: ResolvedSchedule }
  | { ok: false; error: string };

function asISO(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).slice(0, 10);
  return isValidISODate(s) ? s : null;
}

/**
 * Turn request fields into the four columns to store.
 *
 * `startDate`/`handoverDate` accept a date-only string or a full ISO
 * timestamp — both are truncated to the calendar day, because a handover
 * is a day rather than a moment.
 */
export async function resolveSchedule(body: {
  startDate?: unknown;
  handoverDate?: unknown;
  workingDaysPerWeek?: unknown;
  totalWorkingDays?: unknown;
}): Promise<ScheduleOutcome> {
  const rawStart = body.startDate;
  const rawHandover = body.handoverDate;

  const start = asISO(rawStart);
  if (rawStart !== null && rawStart !== undefined && rawStart !== "" && !start) {
    return { ok: false, error: "Invalid start date." };
  }

  const directHandover = asISO(rawHandover);
  if (
    rawHandover !== null &&
    rawHandover !== undefined &&
    rawHandover !== "" &&
    !directHandover
  ) {
    return { ok: false, error: "Invalid handover date." };
  }

  const wantsDerived =
    body.totalWorkingDays !== undefined &&
    body.totalWorkingDays !== null &&
    body.totalWorkingDays !== "";

  if (!wantsDerived) {
    if (start && directHandover && directHandover < start) {
      return {
        ok: false,
        error: "Handover can't fall before the project starts.",
      };
    }
    return {
      ok: true,
      value: {
        startDate: start ? dayToDate(start) : null,
        handoverDate: directHandover ? dayToDate(directHandover) : null,
        // Cleared on purpose: a date typed in directly is no longer the
        // result of a working-day count, and leaving a stale count behind
        // would make the next screen recalculate a different date.
        workingDaysPerWeek: null,
        totalWorkingDays: null,
      },
    };
  }

  // --- derived ------------------------------------------------------
  if (!start) {
    return {
      ok: false,
      error: "A start date is needed to work out the handover date.",
    };
  }

  const total = Number(body.totalWorkingDays);
  if (!Number.isInteger(total) || total < 1 || total > MAX_WORKING_DAYS) {
    return {
      ok: false,
      error: `Total working days must be a whole number between 1 and ${MAX_WORKING_DAYS}.`,
    };
  }

  const weekRaw =
    body.workingDaysPerWeek === undefined || body.workingDaysPerWeek === null
      ? DEFAULT_WORK_WEEK
      : Number(body.workingDaysPerWeek);
  if (!isWorkWeek(weekRaw)) {
    return { ok: false, error: "Working week must be 5 or 6 days." };
  }
  const week: WorkWeek = weekRaw;

  const result = handoverFrom(start, total, week, await holidaySet());
  if (!result) {
    return { ok: false, error: "Couldn't work out a handover date from those." };
  }

  return {
    ok: true,
    value: {
      startDate: dayToDate(start),
      handoverDate: dayToDate(result.handover),
      workingDaysPerWeek: week,
      totalWorkingDays: total,
    },
  };
}
