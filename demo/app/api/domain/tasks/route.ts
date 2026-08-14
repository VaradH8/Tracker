import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  canAssignTasks,
  parseEstimatedHours,
  taskIsOpen,
  type DomainRole,
} from "@/lib/domain";
import { TASK_INCLUDE as INCLUDE, serializeTask as serialize } from "@/lib/domain-task";


export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const mine = url.searchParams.get("mine") === "true";
  /** Tasks this person handed out that are now waiting on their decision. */
  const review = url.searchParams.get("review") === "true";
  const open = url.searchParams.get("open") === "true";

  const assigneeId = url.searchParams.get("assigneeId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = Number(projectId);
  if (assigneeId) where.assigneeId = assigneeId;

  /**
   * Dates filter on when the task was assigned. Every task has that,
   * whereas due dates and submission dates are both optional — filtering
   * on those would silently drop rows rather than narrow them, which is
   * the one thing a filter must never do.
   */
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from + "T00:00:00.000Z");
    if (to) range.lte = new Date(to + "T23:59:59.999Z");
    where.createdAt = range;
  }
  // Actionees and SMEs never see anyone else's tasks; ?mine=true forces
  // "assigned to me" for everyone else.
  if (mine || user.role === "Actionee" || user.role === "SME") {
    where.assigneeId = user.id;
  }
  // The review queue belongs to whoever assigned the task, so that a Lead
  // is not asked to sign off work a Team Lead handed out.
  if (review) {
    where.createdById = user.id;
    where.status = "Submitted";
  }

  const tasks = await prisma.domainTask.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  const rows = tasks.map(serialize);
  // ?open=true keeps the dashboard to what still needs doing, without
  // making the caller know which statuses count as finished.
  return NextResponse.json({
    tasks: open ? rows.filter((t) => taskIsOpen(t.status)) : rows,
  });
}

/**
 * Hand a task to anyone active except yourself.
 *
 * Deliberately unrestricted by role: work gets passed sideways and upwards
 * in practice, and a hierarchy here would just push people to work around
 * it. Accountability comes from the review route instead — approval always
 * returns to whoever assigned the task, so there is exactly one person who
 * can close it.
 *
 * Tags are the exception and still follow `assignableRoles`: they are the
 * delivery unit the whole forecast is built on.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  if (!canAssignTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  /**
   * A task may hang off a project, or off nothing at all — "ad hoc" work
   * that no project owns. An omitted projectId means ad hoc; it is a real
   * choice rather than a missing field.
   */
  let projectId: number | null = null;
  let divisionId: number | null = null;
  if (body.projectId != null && body.projectId !== "") {
    const wanted = Number(body.projectId);
    if (!Number.isFinite(wanted)) {
      return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    }
    const project = await prisma.domainProject.findUnique({
      where: { id: wanted },
      include: { divisions: { select: { divisionId: true } } },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    projectId = project.id;

    // A division is never required — plenty of work spans them — but when
    // one is named it has to belong to this project.
    if (body.divisionId != null && body.divisionId !== "") {
      const d = Number(body.divisionId);
      if (!Number.isFinite(d)) {
        return NextResponse.json({ error: "Invalid division." }, { status: 400 });
      }
      if (!project.divisions.some((x) => x.divisionId === d)) {
        return NextResponse.json(
          { error: "That division isn't set up on this project." },
          { status: 400 },
        );
      }
      divisionId = d;
    }
  } else if (body.divisionId) {
    return NextResponse.json(
      { error: "A division needs a project — ad hoc tasks can't have one." },
      { status: 400 },
    );
  }

  // Validate the assignee is a real, active person who can do work
  // (Actionee or Team Lead — Team Leads log their own work too).
  let assigneeId: string | null = null;
  if (body.assigneeId) {
    const assignee = await prisma.domainUser.findUnique({
      where: { id: String(body.assigneeId) },
    });
    if (!assignee || !assignee.isActive) {
      return NextResponse.json({ error: "Assignee not found." }, { status: 400 });
    }
    // Any active person can be given a task, including a peer or someone
    // more senior — passing work around is not the same as delegating
    // down a hierarchy. What keeps it accountable is that approval always
    // returns to whoever assigned it, never to "any manager".
    //
    // Assigning to yourself is allowed and means something specific: work
    // you picked up on your own initiative. It has no approver by
    // definition, so submitting it records the work rather than queueing
    // it for someone. See the submit branch in ./[id].
    //
    // Tags are deliberately different: they are the delivery unit the
    // forecast is built on, so they still follow assignableRoles.
    assigneeId = assignee.id;
  }

  const created = await prisma.domainTask.create({
    data: {
      title,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      projectId,
      divisionId,
      assigneeId,
      createdById: user.id,
      status: "Assigned",
      startDate: body.startDate ? new Date(String(body.startDate)) : null,
      targetDate: body.targetDate ? new Date(String(body.targetDate)) : null,
      estimatedHours: parseEstimatedHours(body.estimatedHours),
    },
    include: INCLUDE,
  });
  return NextResponse.json({ task: serialize(created) }, { status: 201 });
}