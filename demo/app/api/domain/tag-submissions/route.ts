import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import { LIVE_ASSIGNMENT, backdateFloorISO, backdateWindowLabel, istDayStart, istParts, submissionNeedsReview, type DomainRole } from "@/lib/domain";
import { toISODate } from "@/lib/forecast";

/**
 * The end-of-day "I finished N tags" claim. Submitting does NOT move the
 * delivered count — a Lead has to approve it first (see ./[id]). That
 * approval is the single point where delivered tags, and therefore the
 * whole forecast, moves.
 */

const INCLUDE = {
  assignment: {
    include: {
      project: { select: { id: true, name: true, client: true } },
      division: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      // Who handed the batch over. Carried through so My tags can be
      // filtered by it — "what did Himanshu give me" is a question people
      // ask, and the answer lives on the assignment, not the submission.
      createdBy: { select: { id: true, name: true } },
    },
  },
  submittedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const;

type Row = {
  id: number;
  assignmentId: number;
  date: Date;
  completedCount: number;
  status: string;
  approvedCount: number | null;
  note: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  assignment: {
    assignedCount: number;
    deliveredCount: number;
    complexity: string;
    project: { id: number; name: string; client: string | null };
    division: { id: number; name: string } | null;
    assignee: { id: string; name: string };
    /** Optional in the type, not in the query: every read path includes
     *  it, and a serialiser that throws on a missing relation turns a
     *  display detail into a 500. */
    createdBy?: { id: string; name: string } | null;
  };
  submittedBy: { id: string; name: string };
  reviewedBy: { id: string; name: string } | null;
};

function serialize(s: Row) {
  return {
    id: s.id,
    assignmentId: s.assignmentId,
    date: toISODate(s.date),
    completedCount: s.completedCount,
    approvedCount: s.approvedCount,
    status: s.status,
    note: s.note,
    reviewNote: s.reviewNote,
    projectId: s.assignment.project.id,
    projectName: s.assignment.project.name,
    client: s.assignment.project.client,
    divisionName: s.assignment.division?.name ?? null,
    assigneeId: s.assignment.assignee.id,
    assigneeName: s.assignment.assignee.name,
    assignedBy: s.assignment.createdBy?.name ?? null,
    assignedCount: s.assignment.assignedCount,
    deliveredCount: s.assignment.deliveredCount,
    complexity: s.assignment.complexity,
    submittedBy: s.submittedBy.name,
    reviewedBy: s.reviewedBy?.name ?? null,
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

/**
 * Actionees and SMEs see their own submissions; Leads, Team Leads and
 * Admins see everyone's. `?status=Pending` gives a Lead their review queue.
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("projectId");
  const mine = url.searchParams.get("mine") === "true";
  // Everything already decided — the approval history, newest decision first.
  const reviewed = url.searchParams.get("reviewed") === "true";
  const scopedToSelf = mine || user.role === "Actionee" || user.role === "SME";

  // Both filters narrow the same relation, so they have to be merged rather
  // than spread over each other — two `assignment:` keys would silently
  // drop the first.
  /**
   * Removed work is filtered out for the person it belonged to, and only
   * for them.
   *
   * Taking somebody off a project takes the work off their screens: the
   * assignment goes, and so does the record of what they submitted
   * against it. What must not go is the decision trail a Lead relies on,
   * so Approvals — which is everybody else's view of the same rows —
   * keeps showing them.
   */
  const assignmentWhere = {
    ...(scopedToSelf ? { assigneeId: user.id, ...LIVE_ASSIGNMENT } : {}),
    ...(projectId ? { projectId: Number(projectId) } : {}),
  };

  const submissions = await prisma.domainTagSubmission.findMany({
    where: {
      ...(reviewed ? { status: { in: ["Approved", "Rejected"] } } : {}),
      ...(status && !reviewed ? { status } : {}),
      ...(Object.keys(assignmentWhere).length > 0
        ? { assignment: assignmentWhere }
        : {}),
    },
    include: INCLUDE,
    orderBy: reviewed
      ? [{ reviewedAt: "desc" }]
      : [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ submissions: submissions.map(serialize) });
}

/**
 * Log today's completed count against one assignment. The actionee who
 * holds the assignment submits it; Leads and Admins can file on someone's
 * behalf (a phone call at 7pm still has to land somewhere).
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const body = await req.json().catch(() => ({}));
  const assignmentId = Number(body.assignmentId);
  if (!Number.isFinite(assignmentId)) {
    return NextResponse.json({ error: "Pick an assignment." }, { status: 400 });
  }
  const completedCount = Number(body.completedCount);
  if (!Number.isInteger(completedCount) || completedCount < 1) {
    return NextResponse.json(
      { error: "How many tags did you complete? Enter 1 or more." },
      { status: 400 },
    );
  }

  const assignment = await prisma.domainTagAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      submissions: { where: { status: "Pending" } },
      assignee: { select: { role: true } },
    },
  });
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  const isOwner = assignment.assigneeId === user.id;
  const canFileForOthers = user.role === "Admin" || user.role === "Lead";
  if (!isOwner && !canFileForOthers) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Don't let claims outrun the work: everything already delivered, plus
  // anything still queued for review, plus this claim, has to fit inside
  // what was assigned.
  const pendingTags = assignment.submissions.reduce(
    (sum, s) => sum + s.completedCount,
    0,
  );
  const headroom = assignment.assignedCount - assignment.deliveredCount - pendingTags;
  if (completedCount > headroom) {
    return NextResponse.json(
      {
        error:
          headroom <= 0
            ? "Every tag on this assignment is already delivered or awaiting approval."
            : `You can claim at most ${headroom} more tag(s) on this assignment.`,
      },
      { status: 400 },
    );
  }

  /**
   * Which day the work was done. Held to the same window as work logs and
   * task submissions: never ahead of today, never earlier than the 1st of
   * the current month.
   *
   * This is not merely tidiness. Delivery rates are measured over a
   * trailing window, so a count dated years out falls outside it and is
   * silently ignored by the forecast while still moving deliveredCount —
   * the project reads as delivered at a rate nobody can account for. A
   * backdated count also reopens a month that has already been reported.
   */
  let date = istDayStart();
  if (body.date != null && body.date !== "") {
    const chosen = String(body.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen)) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    const todayISO = istParts().dateISO;
    if (chosen > todayISO) {
      return NextResponse.json(
        { error: "You can't submit tags for a future date." },
        { status: 400 },
      );
    }
    const floor = backdateFloorISO();
    if (chosen < floor) {
      return NextResponse.json(
        {
          error: `Tags can only be submitted ${backdateWindowLabel()} — nothing earlier than ${floor}.`,
        },
        { status: 400 },
      );
    }
    date = new Date(chosen + "T00:00:00.000Z");
  }

  /**
   * The headroom check above reads pending + delivered before writing, so
   * two claims filed at the same moment could both pass it. Re-check inside
   * a transaction and abort if the position moved underneath us — the hard
   * ceiling is still enforced at approval, but catching it here means the
   * actionee is told immediately rather than at review time.
   */
  /**
   * Whose work this is decides whether it waits for review. A Team Lead's
   * own tags are recorded as delivered on the spot; an SME's or Actionee's
   * sit Pending until someone signs them off. Keyed on the assignee, not
   * the filer — a Lead entering a count on an Actionee's behalf must not
   * turn it into an approved one.
   */
  const autoApprove = !submissionNeedsReview({
    assigneeRole: assignment.assignee.role as DomainRole,
    // Tags somebody handed themselves: scoped and claimed by the same
    // person, so the sign-off has to come from someone else.
    selfAssigned: assignment.createdById === assignment.assigneeId,
  });

  const RACED = "HEADROOM_MOVED";
  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      const fresh = await tx.domainTagAssignment.findUnique({
        where: { id: assignmentId },
        include: { submissions: { where: { status: "Pending" } } },
      });
      if (!fresh) throw new Error(RACED);
      const queued = fresh.submissions.reduce((s, x) => s + x.completedCount, 0);
      if (completedCount > fresh.assignedCount - fresh.deliveredCount - queued) {
        throw new Error(RACED);
      }
      const created = await tx.domainTagSubmission.create({
        data: {
          assignmentId,
          date,
          completedCount,
          submittedById: user.id,
          note:
            typeof body.note === "string" && body.note.trim()
              ? body.note.trim()
              : null,
          // reviewedById stays null: nobody reviewed it, and recording the
          // author as their own approver would misread the history.
          ...(autoApprove
            ? {
                status: "Approved",
                approvedCount: completedCount,
                reviewedAt: new Date(),
              }
            : {}),
        },
        include: INCLUDE,
      });

      if (autoApprove) {
        // Same compare-and-set the review path uses: delivered only moves
        // if the headroom genuinely still exists.
        const moved = await tx.domainTagAssignment.updateMany({
          where: {
            id: assignmentId,
            deliveredCount: { lte: fresh.assignedCount - completedCount },
          },
          data: { deliveredCount: { increment: completedCount } },
        });
        if (moved.count === 0) throw new Error(RACED);
      }
      return created;
    });
  } catch (e) {
    if (e instanceof Error && e.message === RACED) {
      return NextResponse.json(
        {
          error:
            "Another submission was filed against this assignment just now — reload and check what's left.",
        },
        { status: 409 },
      );
    }
    throw e;
  }

  // The included assignment was read before the counter moved, so an
  // auto-approved row would report a stale deliveredCount.
  const fresh = autoApprove
    ? await prisma.domainTagSubmission.findUnique({
        where: { id: submission.id },
        include: INCLUDE,
      })
    : null;

  return NextResponse.json(
    { submission: serialize(fresh ?? submission), autoApproved: autoApprove },
    { status: 201 },
  );
}
