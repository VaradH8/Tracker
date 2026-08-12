import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { WORKING_ROLES, type DomainRole } from "@/lib/domain";

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
  project: { select: { id: true, name: true, handoverDate: true } },
  division: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

type Row = {
  id: number;
  assignedCount: number;
  deliveredCount: number;
  createdAt: Date;
  project: { id: number; name: string; handoverDate: Date | null };
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
    handoverDate: a.project.handoverDate
      ? a.project.handoverDate.toISOString().slice(0, 10)
      : null,
    divisionId: a.division?.id ?? null,
    divisionName: a.division?.name ?? null,
    assigneeId: a.assignee.id,
    assigneeName: a.assignee.name,
    assignedCount: a.assignedCount,
    deliveredCount: a.deliveredCount,
    remainingCount: remaining,
    pendingCount: pendingTags,
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
      include: { divisions: { select: { divisionId: true } } },
    }),
    prisma.domainUser.findUnique({ where: { id: assigneeId } }),
  ]);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (!assignee || !assignee.isActive) {
    return NextResponse.json({ error: "Assignee not found." }, { status: 400 });
  }
  if (!WORKING_ROLES.includes(assignee.role as DomainRole)) {
    return NextResponse.json(
      { error: "Tags can only be assigned to Actionees, SMEs, or Team Leads." },
      { status: 400 },
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

  // Same project + division + person tops up the existing row rather than
  // creating a second one, so "another 50 tags to Mukesh" reads as 150.
  const existing = await prisma.domainTagAssignment.findFirst({
    where: { projectId, divisionId, assigneeId },
  });

  const assignment = existing
    ? await prisma.domainTagAssignment.update({
        where: { id: existing.id },
        data: { assignedCount: existing.assignedCount + assignedCount },
        include: INCLUDE,
      })
    : await prisma.domainTagAssignment.create({
        data: {
          projectId,
          divisionId,
          assigneeId,
          assignedCount,
          createdById: user.id,
        },
        include: INCLUDE,
      });

  return NextResponse.json(
    { assignment: serialize(assignment), toppedUp: Boolean(existing) },
    { status: 201 },
  );
}
