import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import { istDayStart } from "@/lib/domain";
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
    project: { id: number; name: string; client: string | null };
    division: { id: number; name: string } | null;
    assignee: { id: string; name: string };
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
    assignedCount: s.assignment.assignedCount,
    deliveredCount: s.assignment.deliveredCount,
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
  const assignmentWhere = {
    ...(scopedToSelf ? { assigneeId: user.id } : {}),
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
    include: { submissions: { where: { status: "Pending" } } },
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

  const date = body.date ? new Date(String(body.date)) : istDayStart();
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  /**
   * The headroom check above reads pending + delivered before writing, so
   * two claims filed at the same moment could both pass it. Re-check inside
   * a transaction and abort if the position moved underneath us — the hard
   * ceiling is still enforced at approval, but catching it here means the
   * actionee is told immediately rather than at review time.
   */
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
      return tx.domainTagSubmission.create({
        data: {
          assignmentId,
          date,
          completedCount,
          submittedById: user.id,
          note:
            typeof body.note === "string" && body.note.trim()
              ? body.note.trim()
              : null,
        },
        include: INCLUDE,
      });
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

  return NextResponse.json({ submission: serialize(submission) }, { status: 201 });
}
