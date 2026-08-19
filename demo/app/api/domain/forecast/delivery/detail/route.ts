import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { SUPERVISOR_ROLES } from "@/lib/domain";
import { isValidISODate } from "@/lib/domain-workdays";
import { dayToDate } from "@/lib/domain-schedule";

/**
 * Everything behind one bar on Delivery by date.
 *
 * The chart answers "how much landed on Tuesday"; this answers "which of
 * it, whose, and who signed it off" — the question anyone actually asks
 * once a number looks wrong.
 *
 * Fetched per date rather than shipped with the chart: a 90-day range
 * holds thousands of submissions, and almost every one of them is never
 * looked at.
 *
 * `date` is the bucket key the chart drew — a day, or the Monday of a
 * week when grouped that way.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  // Same audience as the chart it opens from.
  const forbidden = requireDomainRole(userOrResp, SUPERVISOR_ROLES);
  if (forbidden) return forbidden;

  const q = new URL(req.url).searchParams;
  const date = String(q.get("date") ?? "");
  if (!isValidISODate(date)) {
    return NextResponse.json({ error: "Which date?" }, { status: 400 });
  }

  const groupBy = q.get("groupBy") === "week" ? "week" : "day";
  const from = dayToDate(date);
  const to =
    groupBy === "week" ? new Date(from.getTime() + 6 * DAY_MS) : from;

  // The chart's own filters carry through, so opening a row while
  // filtered to one division doesn't suddenly show every division.
  const divisionId = q.get("divisionId");
  const projectId = q.get("projectId");

  const rows = await prisma.domainTagSubmission.findMany({
    where: {
      date: { gte: from, lte: to },
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
      id: true,
      date: true,
      status: true,
      completedCount: true,
      approvedCount: true,
      note: true,
      reviewedAt: true,
      reviewNote: true,
      createdAt: true,
      submittedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      assignment: {
        select: {
          assignee: { select: { id: true, name: true, role: true } },
          project: { select: { id: true, name: true } },
          division: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  return NextResponse.json({
    date,
    groupBy,
    entries: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      submitted: r.completedCount,
      approved: r.approvedCount,
      note: r.note,
      /** Whose tags these are. */
      person: r.assignment.assignee.name,
      personRole: r.assignment.assignee.role,
      /** Who filed it — usually the same person, not always. */
      submittedBy: r.submittedBy.name,
      submittedAt: r.createdAt.toISOString(),
      project: r.assignment.project.name,
      division: r.assignment.division?.name ?? null,
      reviewedBy: r.reviewedBy?.name ?? null,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      reviewNote: r.reviewNote,
    })),
  });
}
