"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { WORK_WEEKS, type WorkWeek } from "@/lib/domain-workdays";
import { fmtDate } from "@/lib/domain-format";
import { dateClass, selectClass } from "@/lib/domain-ui";

/**
 * Start date, working week, and total working days — with the handover
 * date calculated from them.
 *
 * One component for creating a project, editing one, and simulating one,
 * because the three must agree. A handover date that comes out different
 * depending on which screen you used is worse than not calculating it at
 * all.
 *
 * The date shown is fetched rather than worked out here. The same
 * arithmetic written twice — once in the browser for the preview, once on
 * the server for the save — is exactly how a preview starts disagreeing
 * with what gets stored, and this figure gets quoted to a client. The
 * server owns it; this asks.
 *
 * Both ways of setting the date stay available. Someone who already knows
 * the date switches to "Pick a date" and types it, which is what every
 * project did before this existed.
 */

export type HandoverValue = {
  startDate: string;
  /**
   * Which way the date is being set. Held explicitly rather than inferred
   * from whether the day count is filled in — otherwise a new project
   * with nothing typed yet is indistinguishable from one whose date was
   * picked by hand, and the form opens in the wrong mode.
   */
  mode: "calculate" | "pick";
  totalWorkingDays: string;
  workingDaysPerWeek: WorkWeek;
  /** Only meaningful in "pick" mode; in "calculate" mode it's derived. */
  handoverDate: string;
};

export type Preview = {
  handover: string;
  firstWorkingDay: string;
  weekendsSkipped: number;
  holidaysSkipped: number;
  calendarDays: number;
};

const WEEK_LABELS: Record<WorkWeek, string> = {
  5: "5 days (Mon–Fri)",
  6: "6 days (Mon–Sat)",
};

export function DomainHandoverFields({
  value,
  onChange,
  onPreview,
}: {
  value: HandoverValue;
  onChange: (v: HandoverValue) => void;
  /** Lets the parent show the same figures next to its own result. */
  onPreview?: (p: Preview | null) => void;
}) {
  const calculating = value.mode === "calculate";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Latest-wins: typing "60" fires three requests and the one that
  // matters is the last, not whichever the network returns last.
  const seq = useRef(0);

  useEffect(() => {
    if (!calculating || !value.startDate) {
      setPreview(null);
      setError(null);
      onPreview?.(null);
      return;
    }
    const total = Number(value.totalWorkingDays);
    if (!Number.isInteger(total) || total < 1) {
      setPreview(null);
      setError(null);
      onPreview?.(null);
      return;
    }

    const mine = ++seq.current;
    setBusy(true);
    const q = new URLSearchParams({
      start: value.startDate,
      days: String(total),
      week: String(value.workingDaysPerWeek),
    });
    fetch(`/api/domain/holidays/preview?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Couldn't work that out.");
        return b as Preview;
      })
      .then((p) => {
        if (mine !== seq.current) return;
        setPreview(p);
        setError(null);
        onPreview?.(p);
      })
      .catch((e: Error) => {
        if (mine !== seq.current) return;
        setPreview(null);
        setError(e.message);
        onPreview?.(null);
      })
      .finally(() => {
        if (mine === seq.current) setBusy(false);
      });
    // onPreview is intentionally excluded: parents pass an inline function,
    // and depending on it would refetch on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculating, value.startDate, value.totalWorkingDays, value.workingDaysPerWeek]);

  const set = (patch: Partial<HandoverValue>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Start date</span>
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
            className={dateClass("sm")}
          />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Handover</span>
          <select
            value={calculating ? "calc" : "pick"}
            onChange={(e) =>
              set({ mode: e.target.value === "calc" ? "calculate" : "pick" })
            }
            className={selectClass("sm", "w-full")}
          >
            <option value="calc">From working days</option>
            <option value="pick">Pick a date</option>
          </select>
        </label>
      </div>

      {calculating ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="block text-ink-700 mb-1">Working week</span>
              <select
                value={value.workingDaysPerWeek}
                onChange={(e) =>
                  set({ workingDaysPerWeek: Number(e.target.value) as WorkWeek })
                }
                className={selectClass("sm", "w-full")}
              >
                {WORK_WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {WEEK_LABELS[w]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="block text-ink-700 mb-1">Total working days</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={value.totalWorkingDays}
                onChange={(e) => set({ totalWorkingDays: e.target.value })}
                placeholder="e.g. 60"
                className="w-full px-2.5 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </label>
          </div>

          {/* The answer, stated plainly with its working shown — a date
              somebody has to defend to a client needs to be checkable. */}
          <div className="rounded border border-ink-200 bg-ink-50 px-3 py-2.5">
            {busy && !preview ? (
              <p className="text-xs text-ink-500 flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> Working it out…
              </p>
            ) : error ? (
              <p className="text-xs text-brand-redText">{error}</p>
            ) : preview ? (
              <>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <CalendarClock size={14} className="text-brand-blue shrink-0" />
                  <span className="text-[11px] uppercase tracking-wide text-ink-500 font-medium">
                    Handover
                  </span>
                  <strong className="font-heading text-base text-ink-900">
                    {fmtDate(preview.handover)}
                  </strong>
                </div>
                <p className="text-[11px] text-ink-500 mt-1">
                  {value.totalWorkingDays} working days from{" "}
                  {fmtDate(preview.firstWorkingDay)} ·{" "}
                  {preview.weekendsSkipped} weekend day
                  {preview.weekendsSkipped === 1 ? "" : "s"} skipped
                  {preview.holidaysSkipped > 0 && (
                    <>
                      {" · "}
                      <span className="text-brand-yellowText">
                        {preview.holidaysSkipped} public holiday
                        {preview.holidaysSkipped === 1 ? "" : "s"} skipped
                      </span>
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-500">
                Enter a start date and how many working days the project needs.
              </p>
            )}
          </div>
        </>
      ) : (
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Handover date</span>
          <input
            type="date"
            value={value.handoverDate}
            min={value.startDate || undefined}
            onChange={(e) => set({ handoverDate: e.target.value })}
            className={dateClass("sm")}
          />
        </label>
      )}
    </div>
  );
}

/**
 * The schedule fields to send with a save.
 *
 * In calculate mode the handover date is deliberately omitted: the server
 * works it out, and sending a date the browser guessed would only invite
 * the two to disagree.
 */
export function handoverPayload(v: HandoverValue) {
  if (v.mode === "calculate" && v.totalWorkingDays !== "") {
    return {
      startDate: v.startDate || null,
      workingDaysPerWeek: v.workingDaysPerWeek,
      totalWorkingDays: Number(v.totalWorkingDays),
    };
  }
  return {
    startDate: v.startDate || null,
    handoverDate: v.handoverDate || null,
    totalWorkingDays: null,
  };
}

export function emptyHandover(): HandoverValue {
  return {
    startDate: "",
    // New projects open on the calculator: the point of this is that the
    // date gets worked out rather than guessed at.
    mode: "calculate",
    totalWorkingDays: "",
    workingDaysPerWeek: 5,
    handoverDate: "",
  };
}

/** Rebuild the form state from a saved project. */
export function handoverFromProject(p: {
  startDate?: string | null;
  handoverDate?: string | null;
  workingDaysPerWeek?: number | null;
  totalWorkingDays?: number | null;
}): HandoverValue {
  return {
    startDate: p.startDate ?? "",
    // A project whose date was typed in reopens on the date picker, so
    // editing it doesn't silently convert it to a calculated one.
    mode: p.totalWorkingDays ? "calculate" : "pick",
    handoverDate: p.handoverDate ?? "",
    workingDaysPerWeek: (p.workingDaysPerWeek === 6 ? 6 : 5) as WorkWeek,
    totalWorkingDays: p.totalWorkingDays ? String(p.totalWorkingDays) : "",
  };
}
