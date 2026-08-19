import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  assignableRoles,
  assignmentCapIssue,
  normaliseComplexity,
  type DomainRole,
} from "@/lib/domain";
import { toISODate } from "@/lib/forecast";

/**
 * "100 Electrical tags on Project X to Mukesh."
 *
 * One row per project + division + person. The same person can hold
 * several rows on one project when the work spans divisions, which is how
 * division-wise assignment stays visible per actionee.
 *
 * deliveredCount is never written here — it only moves when a Lead
 * approves a submission (see ../tag-submissions).
 */

const INCLUDE = {
  project: {
    select: { id: true, name: true, handoverDate: true, client: true },
  },
  division: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

type Row = {
  id: number;
  assignedCount: number;
  deliveredCount: number;
  complexity: string;
  startDate: Date | null;
  targetDate: Date | null;
  createdAt: Date;
  project: {
    id: number;
    name: string;
    handoverDate: Date | null;
    client: string | null;
  };
  division: { id: number; name: string } | null;
  assignee: { id: string; name: string; role: string };
  createdBy: { id: string; name: string };
};

function serialize(a: Row, pendingTags = 0) {
  const remaining = Math.max(0, a.assignedCount - a.deliveredCount);
  return {
    id: a.id,
    projectId: a.project.id,
    projectName: a.project.name,
    client: a.project.client,
    handoverDate: a.project.handoverDate
      ? a.project.handoverDate.toISOString().slice(0, 10)
      : null,
    divisionId: a.division?.id ?? null,
    divisionName: a.division?.name ?? null,
    assigneeId: a.assignee.id,
    assigneeName: a.assignee.name,
    assignedCount: a.assignedCount,
    deliveredCount: a.deliveredCount,
    complexity: a.complexity,
    remainingCount: remaining,
    pendingCount: pendingTags,
    startDate: a.startDate ? toISODate(a.startDate) : null,
    targetDate: a.targetDate ? toISODate(a.targetDate) : null,
    createdBy: a.createdBy.name,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Actionees and SMEs see only their own assignments — that's their "what
 * am I carrying" view. Leads, Team Leads and Admins see everything, and can
 * narrow by project or person.
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const assigneeId = url.searchParams.get("assigneeId");
  const mine = url.searchParams.get("mine") === "true";

  const scopedToSelf = mine || user.role === "Actionee" || user.role === "SME";

  const assignments = await prisma.domainTagAssignment.findMany({
    where: {
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(scopedToSelf ? { assigneeId: user.id } : assigneeId ? { assigneeId } : {}),
    },
    include: INCLUDE,
    orderBy: [{ createdAt: "desc" }],
  });

  // Tags claimed but not yet reviewed, so the actionee can see what's
  // awaiting a Lead rather than re-submitting it.
  const pending = await prisma.domainTagSubmission.groupBy({
    by: ["assignmentId"],
    where: {
      status: "Pending",
      assignmentId: { in: assignments.map((a) => a.id) },
    },
    _sum: { completedCount: true },
  });
  const pendingBy = new Map(
    pending.map((p) => [p.assignmentId, p._sum.completedCount ?? 0]),
  );

  return NextResponse.json({
    assignments: assignments.map((a) => serialize(a, pendingBy.get(a.id) ?? 0)),
  });
}

/** Leads, Team Leads and Admins assign tags. */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));

  const projectId = Number(body.projectId);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Pick a project." }, { status: 400 });
  }
  const assigneeId = String(body.assigneeId ?? "");
  if (!assigneeId) {
    return NextResponse.json({ error: "Pick who the tags are for." }, { status: 400 });
  }
  const assignedCount = Number(body.assignedCount);
  if (!Number.isInteger(assignedCount) || assignedCount < 1) {
    return NextResponse.json(
      { error: "How many tags? Enter a whole number of 1 or more." },
      { status: 400 },
    );
  }

  const [project, assignee] = await Promise.all([
    prisma.domainProject.findUnique({
      where: { id: projectId },
      include: { divisions: { select: { divisionId: true, totalTags: true } } },
    }),
    prisma.domainUser.findUnique({ where: { id: assigneeId } }),
  ]);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (!assignee || !assignee.isActive) {
    return NextResponse.json({ error: "Assignee not found." }, { status: 400 });
  }
  // Tags go down the hierarchy, and — for Leads and Team Leads, who carry
  // delivery themselves — sideways and to oneself too. Never upward: a
  // Team Lead still cannot hand tags to a Lead. See assignableRoles.
  const allowedAssignees = assignableRoles(user.role);
  if (!allowedAssignees.includes(assignee.role as DomainRole)) {
    return NextResponse.json(
      {
        error: `You can assign tags to ${allowedAssignees.join(", ")} — not to a ${assignee.role}.`,
      },
      { status: 403 },
    );
  }
  // A division is optional, but when given it has to be one this project
  // actually uses — otherwise the per-division rollups stop adding up.
  let divisionId: number | null = null;
  if (body.divisionId !== undefined && body.divisionId !== null && body.divisionId !== "") {
    const requested = Number(body.divisionId);
    if (!Number.isFinite(requested)) {
      return NextResponse.json({ error: "Invalid division." }, { status: 400 });
    }
    if (!project.divisions.some((d) => d.divisionId === requested)) {
      return NextResponse.json(
        { error: "That division isn't set up on this project." },
        { status: 400 },
      );
    }
    divisionId = requested;
  } else if (project.divisions.length > 0) {
    return NextResponse.json(
      { error: "This project is split by division — pick one." },
      { status: 400 },
    );
  }

  // Unset, unrecognised, or simply not answered all mean Simple.
  const complexity = normaliseComplexity(body.complexity);

  const startDate = body.startDate ? new Date(String(body.startDate)) : null;
  const targetDate = body.targetDate ? new Date(String(body.targetDate)) : null;
  if (startDate && Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
  }
  if (targetDate && Number.isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: "Invalid target date." }, { status: 400 });
  }
  if (startDate && targetDate && targetDate < startDate) {
    return NextResponse.json(
      { error: "The target date can't fall before the start date." },
      { status: 400 },
    );
  }

  // You can't hand out more tags than the division (or the project, when
  // there are no divisions) actually holds.
  const siblings = await prisma.domainTagAssignment.findMany({
    where: { projectId, divisionId },
    select: { assignedCount: true },
  });
  const alreadyAssigned = siblings.reduce((s, a) => s + a.assignedCount, 0);
  const cap =
    divisionId === null
      ? project.totalTags
      : (project.divisions.find((d) => d.divisionId === divisionId)?.totalTags ?? 0);
  const capIssue = assignmentCapIssue(
    cap,
    alreadyAssigned,
    assignedCount,
    divisionId === null ? "project" : "division",
  );
  if (capIssue) return NextResponse.json({ error: capIssue }, { status: 400 });

  // Same project + division + person tops up the existing row rather than
  // creating a second one, so "another 50 tags to Mukesh" reads as 150.
  const existing = await prisma.domainTagAssignment.findFirst({
    where: { projectId, divisionId, assigneeId },
  });

  const assignment = existing
    ? await prisma.domainTagAssignment.update({
        where: { id: existing.id },
        data: {
          assignedCount: existing.assignedCount + assignedCount,
          // Dates given on a top-up refresh the batch; omitted, they stand.
          ...(startDate ? { startDate } : {}),
          ...(targetDate ? { targetDate } : {}),
          // Same for complexity: state it to change it, omit it to keep
          // what the batch already says.
          ...(body.complexity ? { complexity } : {}),
        },
        include: INCLUDE,
      })
    : await prisma.domainTagAssignment.create({
        data: {
          projectId,
          divisionId,
          assigneeId,
          assignedCount,
          complexity,
          startDate,
          targetDate,
          createdById: user.id,
        },
        include: INCLUDE,
      });

  return NextResponse.json(
    { assignment: serialize(assignment), toppedUp: Boolean(existing) },
    { status: 201 },
  );
}
