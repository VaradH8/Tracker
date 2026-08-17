"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  DOMAIN_ROLE_LABELS,
  TAG_HOLDER_ROLES,
  type DomainRole,
} from "@/lib/domain";
import { availableFrom as freeAfter, toISODate } from "@/lib/forecast";
import { duplicateNames } from "@/components/DomainResourcePicker";
import { fmtDate as fmt } from "@/lib/domain-format";

/**
 * Resource availability, organised the way a project manager reads it:
 * one section per role, and within each section the fastest deliverers
 * first.
 *
 * Roles get separate blocks rather than being interleaved — "who are my
 * Team Leads" and "who are my Actionees" are different questions, and one
 * mixed list answers neither well. Within a person, one row per booking,
 * with their identity, rate and free-from date spanning those rows.
 */

export type ResourceRow = {
  id: string;
  name: string;
  /** Disambiguates rows when two people share a display name. */
  email?: string;
  role: DomainRole;
  rate: number | null;
  /** Observed throughput. Null until there is approved work to divide. */
  measuredRate: number | null;
  approvedTags?: number;
  measuredDays?: number;
  /** Undelivered tags across every project, booked or not. */
  openTags?: number;
  openTagProjects?: { projectId: number; projectName: string; openTags: number }[];
  rateSource?: "measured" | "expected" | "default";
  availableFrom: string | null;
  status: "Free" | "Allocated";
  projects: {
    projectId: number;
    projectName: string;
    startDate: string;
    endDate: string;
    releasedAt: string | null;
    assignedTags: number;
    deliveredTags: number;
  }[];
};


/**
 * The day the last person in a set comes free — i.e. when the whole group
 * is available. Null means everyone is free already.
 */
export function allFreeFrom(rows: ResourceRow[]): string | null {
  const dates = rows
    .map((r) => r.availableFrom)
    .filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max));
}

/** The first upcoming release across a set — who frees up soonest. */
export function nextFreeFrom(rows: ResourceRow[]): string | null {
  const dates = rows
    .map((r) => r.availableFrom)
    .filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  return dates.reduce((min, d) => (d < min ? d : min));
}

/** When one booking releases the person — the working day after it ends. */
function bookingFreeFrom(endDate: string, releasedAt: string | null): string {
  const d = freeAfter([
    {
      endDate: new Date((releasedAt ?? endDate) + "T00:00:00Z"),
      releasedAt: null,
    },
  ]);
  return d ? toISODate(d) : endDate;
}

/**
 * Fastest measured first, then alphabetical. People with nothing measured
 * sort to the bottom rather than being ranked on a number they never
 * earned.
 */
function byRateDesc(a: ResourceRow, b: ResourceRow): number {
  const ar = a.measuredRate ?? -1;
  const br = b.measuredRate ?? -1;
  if (br !== ar) return br - ar;
  return a.name.localeCompare(b.name);
}

/** Thin progress bar for one booking's tag delivery. */
function Progress({ delivered, assigned }: { delivered: number; assigned: number }) {
  if (assigned <= 0) {
    return <span className="text-xs text-ink-400 italic">no tags yet</span>;
  }
  const pct = Math.min(100, (delivered / assigned) * 100);
  return (
    <div className="min-w-[110px]">
      <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden">
        <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-ink-500 mt-0.5">
        {delivered} / {assigned}
      </div>
    </div>
  );
}

export function DomainResourceTable({ resources }: { resources: ResourceRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "allocated">("all");
  const [role, setRole] = useState<"all" | DomainRole>("all");

  const freeCount = resources.filter((r) => r.status === "Free").length;
  const allocatedCount = resources.length - freeCount;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      if (filter === "free" && r.status !== "Free") return false;
      if (filter === "allocated" && r.status !== "Allocated") return false;
      if (role !== "all" && r.role !== role) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.projects.some((p) => p.projectName.toLowerCase().includes(q))
      );
    });
  }, [resources, query, filter, role]);

  // One block per role, each sorted fastest-first.
  const sections = useMemo(
    () =>
      TAG_HOLDER_ROLES.map((r) => ({
        role: r,
        people: shown.filter((p) => p.role === r).sort(byRateDesc),
      })).filter((s) => s.people.length > 0),
    [shown],
  );

  if (resources.length === 0) {
    return <p className="text-sm text-ink-400 italic">No resources yet.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person or project"
            className="pl-8 pr-3 py-1.5 rounded border border-ink-200 text-sm w-60"
          />
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              ["all", `All ${resources.length}`],
              ["free", `Free ${freeCount}`],
              ["allocated", `Allocated ${allocatedCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                filter === key
                  ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                  : "bg-white text-ink-600 border-ink-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 sm:ml-auto">
          <span className="text-xs text-ink-400 mr-1">Role</span>
          {(["all", ...TAG_HOLDER_ROLES] as const).map((key) => {
            const n =
              key === "all"
                ? resources.length
                : resources.filter((r) => r.role === key).length;
            if (key !== "all" && n === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setRole(key)}
                className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                  role === key
                    ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                    : "bg-white text-ink-600 border-ink-200"
                }`}
              >
                {key === "all" ? "All" : DOMAIN_ROLE_LABELS[key]} {n}
              </button>
            );
          })}
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-ink-400 italic">Nobody matches that search.</p>
      ) : (
        <div className="grid gap-6">
          {sections.map((s) => (
            <RoleSection
              key={s.role}
              role={s.role}
              people={s.people}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One role's people, fastest first, in their own table. */
function RoleSection({
  role,
  people,
}: {
  role: DomainRole;
  people: ResourceRow[];
}) {
  const free = people.filter((p) => p.status === "Free").length;
  const dupes = duplicateNames(people);
  const openTotal = people.reduce(
    (s, p) =>
      s +
      (p.openTags ??
        p.projects.reduce(
          (t, x) => t + Math.max(0, x.assignedTags - x.deliveredTags),
          0,
        )),
    0,
  );
  const groupAllFree = allFreeFrom(people);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <h3 className="font-heading text-base font-semibold">
          {DOMAIN_ROLE_LABELS[role]}s
          <span className="font-sans font-normal text-sm text-ink-500">
            {" "}
            · {people.length} {people.length === 1 ? "person" : "people"} · {free} free
          </span>
        </h3>
        <span className="text-xs text-ink-500">
          {openTotal} tags open ·{" "}
          {groupAllFree ? (
            <>
              all free from{" "}
              <strong className="text-ink-700">{fmt(groupAllFree)}</strong>
            </>
          ) : (
            <strong className="text-brand-greenText">all free now</strong>
          )}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[940px]">
          <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-right font-semibold px-3 py-2 w-10">#</th>
              <th className="text-left font-semibold px-4 py-2">Person</th>
              {/* Average tags/day deliberately does not appear here. It is
                  set and read in the Projects section, against the project
                  it applies to; repeating a cross-project average on this
                  screen invited it to be read as a target. */}
              <th className="text-left font-semibold px-4 py-2">Status</th>
              <th className="text-left font-semibold px-4 py-2">Project</th>
              <th className="text-left font-semibold px-4 py-2">Booked</th>
              <th className="text-left font-semibold px-4 py-2">Tags delivered</th>
              <th className="text-right font-semibold px-4 py-2">Open</th>
              <th className="text-left font-semibold px-4 py-2">Free from</th>
            </tr>
          </thead>
          <tbody>
            {people.map((r, idx) => {
              const rows = Math.max(1, r.projects.length);
              // Everything outstanding, including tags on projects with no
              // booking — summing the bookings alone reported 0 for exactly
              // the people this column most needs to flag.
              const openTags =
                r.openTags ??
                r.projects.reduce(
                  (s, p) => s + Math.max(0, p.assignedTags - p.deliveredTags),
                  0,
                );

              const lead = (
                <>
                  <td
                    rowSpan={rows}
                    className="px-3 py-2 align-top text-right border-t border-ink-100 text-xs text-ink-400"
                  >
                    {idx + 1}
                  </td>
                  <td
                    rowSpan={rows}
                    className="px-4 py-2 align-top border-t border-ink-100"
                  >
                    <div className="font-medium text-ink-900 flex items-center gap-1.5 flex-wrap">
                      {r.name}
                      {/* Two accounts can carry the same display name; the
                          email is what separates the rows. */}
                      {dupes.has(r.name) && r.email && (
                        <span className="text-[11px] font-normal text-ink-500">
                          {r.email}
                        </span>
                      )}
                      {/* The "fastest" badge went with the rate column. It
                          ranked people by a number this screen no longer
                          shows, which is worse than not ranking them —
                          a label nobody can check. */}
                    </div>
                  </td>
                  <td
                    rowSpan={rows}
                    className="px-4 py-2 align-top border-t border-ink-100"
                  >
                    <span
                      className={`px-2 py-0.5 rounded-pill text-xs font-medium ${
                        r.status === "Free"
                          ? "bg-brand-greenBg text-brand-greenText"
                          : "bg-brand-blueBg text-brand-blue"
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.projects.length > 1 && (
                      <div className="text-xs text-brand-yellowText mt-1">
                        {r.projects.length} at once
                      </div>
                    )}
                  </td>
                </>
              );

              const tail = (
                <>
                  <td
                    rowSpan={rows}
                    className="px-4 py-2 align-top text-right border-t border-ink-100"
                  >
                    <span
                      className={
                        openTags > 0 ? "text-ink-900 font-medium" : "text-ink-400"
                      }
                    >
                      {openTags}
                    </span>
                  </td>
                  <td
                    rowSpan={rows}
                    className="px-4 py-2 align-top border-t border-ink-100"
                  >
                    {/* No booking end date does not mean available: tags
                        can be outstanding with no window around them. */}
                    {r.availableFrom ? (
                      <span className="text-ink-700">{fmt(r.availableFrom)}</span>
                    ) : (r.openTags ?? 0) > 0 ? (
                      <span className="text-brand-yellowText">
                        When tags are cleared
                      </span>
                    ) : (
                      <span className="text-brand-greenText font-medium">Now</span>
                    )}
                  </td>
                </>
              );

              if (r.projects.length === 0) {
                const stray = r.openTagProjects ?? [];
                return (
                  <tr key={r.id}>
                    {lead}
                    <td
                      colSpan={3}
                      className="px-4 py-2 align-top border-t border-ink-100 text-xs"
                    >
                      {stray.length === 0 ? (
                        <span className="text-ink-400 italic">Nothing booked</span>
                      ) : (
                        // Holding tags without a booking — the case that used
                        // to read as "Free, nothing booked".
                        <span className="text-brand-yellowText">
                          {stray
                            .map((p) => `${p.projectName} · ${p.openTags} tags open`)
                            .join(" · ")}{" "}
                          <span className="text-ink-400">(no booking window)</span>
                        </span>
                      )}
                    </td>
                    {tail}
                  </tr>
                );
              }

              return r.projects.map((p, i) => (
                <tr key={`${r.id}-${p.projectId}`}>
                  {i === 0 && lead}
                  <td
                    className={`px-4 py-2 align-top ${i === 0 ? "border-t border-ink-100" : ""}`}
                  >
                    <div className="text-ink-900">{p.projectName}</div>
                    {p.releasedAt && (
                      <div className="text-xs text-ink-400">released early</div>
                    )}
                  </td>
                  <td
                    className={`px-4 py-2 align-top text-ink-700 whitespace-nowrap ${i === 0 ? "border-t border-ink-100" : ""}`}
                  >
                    {fmt(p.startDate)} → {fmt(p.releasedAt ?? p.endDate)}
                    {/* When this particular booking releases them — a person on
                        several projects comes off each one on its own date. */}
                    <div className="text-xs text-ink-400">
                      frees {fmt(bookingFreeFrom(p.endDate, p.releasedAt))}
                    </div>
                  </td>
                  <td
                    className={`px-4 py-2 align-top ${i === 0 ? "border-t border-ink-100" : ""}`}
                  >
                    <Progress delivered={p.deliveredTags} assigned={p.assignedTags} />
                  </td>
                  {i === 0 && tail}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
