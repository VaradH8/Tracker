"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * The delivery record behind a project's forecast: which tags were signed
 * off on which day, split by division, naming the actionee who submitted
 * each count and the Lead who approved it.
 *
 * Everything here is approved work only. A claim still awaiting review has
 * not been delivered, so it never appears — which is why these figures
 * always reconcile with the projected date above.
 */

type Entry = {
  submissionId: number;
  assigneeId: string;
  assigneeName: string;
  count: number;
  claimed: number;
  approvedBy: string | null;
  approvedAt: string | null;
  note: string | null;
};

type Day = {
  date: string;
  total: number;
  divisions: {
    divisionId: number | null;
    divisionName: string;
    total: number;
    entries: Entry[];
  }[];
};

type DivisionRate = {
  divisionId: number | null;
  divisionName: string;
  totalTags: number;
  delivered: number;
  remaining: number;
  activeDays: number;
  perDay: number;
};

function fmt(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function DomainDeliveryLog({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<Day[] | null>(null);
  const [rates, setRates] = useState<DivisionRate[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string; delivered: number }[]>(
    [],
  );

  const load = useCallback(() => {
    fetch(`/api/domain/projects/${projectId}/deliveries`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { days: [], divisionRates: [], peopleEngaged: [] }))
      .then((b) => {
        setDays(b.days ?? []);
        setRates(b.divisionRates ?? []);
        setPeople(b.peopleEngaged ?? []);
      })
      .catch(() => setDays([]));
  }, [projectId]);

  // Only fetch once someone asks for the detail.
  useEffect(() => {
    if (open && days === null) load();
  }, [open, days, load]);

  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue"
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        Delivery record — daily counts by division and actionee
      </button>

      {open && (
        <div className="mt-3">
          {days === null ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : (
            <>
              {/* Per-division pace, measured from approved work. */}
              {rates.length > 0 && (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left font-semibold px-3 py-2">Division</th>
                        <th className="text-right font-semibold px-3 py-2">Total</th>
                        <th className="text-right font-semibold px-3 py-2">Delivered</th>
                        <th className="text-right font-semibold px-3 py-2">Remaining</th>
                        <th className="text-right font-semibold px-3 py-2">Tags/day</th>
                        <th className="text-right font-semibold px-3 py-2">Active days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {rates.map((d) => (
                        <tr key={String(d.divisionId)}>
                          <td className="px-3 py-2 text-ink-900 font-medium">
                            {d.divisionName}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-700">
                            {d.totalTags || "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-brand-greenText font-semibold">
                            {d.delivered}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-700">
                            {d.remaining}
                          </td>
                          <td className="px-3 py-2 text-right font-heading font-semibold text-ink-900">
                            {d.perDay || "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-500">
                            {d.activeDays || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {people.length > 0 && (
                <p className="text-xs text-ink-500 mb-3">
                  <strong className="text-ink-700">{people.length}</strong> people
                  engaged:{" "}
                  {people
                    .map((x) => `${x.name} (${x.delivered})`)
                    .join(" · ")}
                </p>
              )}

              {days.length === 0 ? (
                <p className="text-sm text-ink-400 italic">
                  Nothing approved on this project yet — counts appear here once a
                  Lead signs them off.
                </p>
              ) : (
                <div className="grid gap-3">
                  {days.map((day) => (
                    <div
                      key={day.date}
                      className="rounded-card border border-ink-200 overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-2 bg-ink-50 border-b border-ink-200">
                        <span className="font-medium text-ink-900">
                          {fmt(day.date)}
                        </span>
                        <span className="text-sm text-ink-700">
                          <strong className="text-brand-greenText">{day.total}</strong>{" "}
                          tags delivered
                        </span>
                      </div>
                      {day.divisions.map((div) => (
                        <div key={String(div.divisionId)} className="px-4 py-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-ink-800">
                              {div.divisionName}
                            </span>
                            <span className="text-ink-700">{div.total} tags</span>
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {div.entries.map((e) => (
                              <li
                                key={e.submissionId}
                                className="text-xs text-ink-600 flex items-baseline gap-2 flex-wrap"
                              >
                                <span className="text-ink-900">{e.assigneeName}</span>
                                <strong className="text-ink-900">{e.count}</strong>
                                {e.count !== e.claimed && (
                                  <span className="text-brand-yellowText">
                                    (claimed {e.claimed})
                                  </span>
                                )}
                                {e.approvedBy && (
                                  <span className="text-ink-400">
                                    approved by {e.approvedBy}
                                  </span>
                                )}
                                {e.note && (
                                  <span className="text-ink-500">
                                    &ldquo;{e.note}&rdquo;
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
