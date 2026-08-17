import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { SUPERVISOR_ROLES } from "@/lib/domain";
import { toISODate } from "@/lib/forecast";

/**
 * Delivery by date: how many tags were submitted, and how many of those
 * were signed off, on each day (or week) across the whole portfolio.
 *
 * Both numbers are reported, never just one. "Submitted" is what people
 * claimed they did; "approved" is what a Lead agreed with. Showing only
 * the first would overstate delivery, and showing only the second would
 * hide a backlog sitting in review — the gap between them is the useful
 * signal, and it is the same distinction the forecast is built on.
 *
 * Dated by the day the WORK was done, not the day it was reviewed. A
 * count approved a week late still belongs to the day it was earned,
 * otherwise a slow reviewer looks like a productive Friday.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Guards against an open-ended range being asked for by hand. */
const MAX_DAYS = 366;

/** Monday of the week a date falls in, as a UTC day key. */
function weekStart(d: Date): Date {
  const day = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
}

export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  // Same audience as the rest of Forecast: this is a cross-team view.
  const forbidden = requireDomainRole(userOrResp, SUPERVISOR_ROLES);
  if (forbidden) return forbidden;

  const q = new URL(req.url).searchParams;
  const groupBy = q.get("groupBy") === "week" ? "week" : "day";

  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Number(q.get("days")) || 30),
  );
  const today = new Date();
  const to = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  const rangeStart = groupBy === "week" ? weekStart(from) : from;

  const divisionId = q.get("divisionId");
  const projectId = q.get("projectId");

  const submissions = await prisma.domainTagSubmission.findMany({
    where: {
      date: { gte: rangeStart, lte: to },
      ...(divisionId || projectId
        ? {
            assignment: {
              ...(divisionId ? { divisionId: Number(divisionId) } : {}),
              ...(projectId ? { projectId: Number(projectId) } : {}),
            },
          }
        : {}),
    },
    select: {
      date: true,
      status: true,
      completedCount: true,
      approvedCount: true,
      assignment: {
        select: {
          assignee: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          division: { select: { id: true, name: true } },
        },
      },
    },
  });

  /**
   * Every bucket in the range is emitted, including the empty ones. A
   * chart that silently omits days with no delivery draws a flat line
   * through a week nobody worked, which is the opposite of what a gap
   * should look like.
   */
  const buckets = new Map<
    string,
    {
      key: string;
      submitted: number;
      approved: number;
      pending: number;
      rejected: number;
      entries: number;
      people: Set<string>;
    }
  >();
  const step = groupBy === "week" ? 7 * DAY_MS : DAY_MS;
  for (let t = rangeStart.getTime(); t <= to.getTime(); t += step) {
    const key = toISODate(new Date(t));
    buckets.set(key, {
      key, submitted: 0, approved: 0, pending: 0, rejected: 0,
      entries: 0, people: new Set(),
    });
  }

  for (const s of submissions) {
    const key = toISODate(groupBy === "week" ? weekStart(s.date) : s.date);
    const b = buckets.get(key);
    if (!b) continue;
    b.entries += 1;
    b.submitted += s.completedCount;
    b.people.add(s.assignment.assignee.id);
    if (s.status === "Approved") b.approved += s.approvedCount ?? 0;
    else if (s.status === "Pending") b.pending += s.completedCount;
    else if (s.status === "Rejected") b.rejected += s.completedCount;
  }

  const rows = Array.from(buckets.values())
    .sort((a, b) => (a.key < b.key ? 1 : -1)) // newest first
    .map((b) => ({
      key: b.key,
      submitted: b.submitted,
      approved: b.approved,
      pending: b.pending,
      rejected: b.rejected,
      entries: b.entries,
      people: b.people.size,
    }));

  /**
   * The division list offered by the filter is the one this data actually
   * spans, not the whole catalogue — a filter that can select "nothing
   * here" wastes the reader's time. "No division" is included as its own
   * option because plenty of tags are assigned straight to a project.
   */
  const divisions = new Map<string, { id: number | null; name: string }>();
  const projects = new Map<number, { id: number; name: string }>();
  for (const s of submissions) {
    const d = s.assignment.division;
    divisions.set(String(d?.id ?? "none"), {
      id: d?.id ?? null,
      name: d?.name ?? "No division",
    });
    projects.set(s.assignment.project.id, s.assignment.project);
  }

  const totals = rows.reduce(
    (acc, r) => ({
      submitted: acc.submitted + r.submitted,
      approved: acc.approved + r.approved,
      pending: acc.pending + r.pending,
      rejected: acc.rejected + r.rejected,
      entries: acc.entries + r.entries,
    }),
    { submitted: 0, approved: 0, pending: 0, rejected: 0, entries: 0 },
  );

  const active = rows.filter((r) => r.entries > 0).length;

  return NextResponse.json({
    groupBy,
    days,
    from: toISODate(rangeStart),
    to: toISODate(to),
    rows,
    totals: {
      ...totals,
      /** Averaged over buckets that actually had work, not over the whole
       *  range — dividing by idle days answers a different question. */
      averagePerActive: active > 0 ? Math.round((totals.approved / active) * 10) / 10 : 0,
      activeBuckets: active,
    },
    divisions: Array.from(divisions.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    projects: Array.from(projects.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  });
}
