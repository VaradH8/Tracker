import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  DOMAIN_TASK_PRIORITIES,
  DOMAIN_TASK_STATUSES,
  SUPERVISOR_ROLES,
  canAssignTasks,
  normaliseTaskPriority,
  parseEstimatedHours,
  taskIsOpen,
  type DomainRole,
  type DomainTaskStatus,
} from "@/lib/domain";
import { TASK_INCLUDE as INCLUDE, serializeTask as serialize } from "@/lib/domain-task";
import { cleanReviewerIds } from "@/lib/domain-task-review";


export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const mine = url.searchParams.get("mine") === "true";
  /** Tasks waiting on THIS person's decision — the approval queue. */
  const review = url.searchParams.get("review") === "true";
  /** Tasks this person handed out, whatever state they are in. */
  const assignedByMe = url.searchParams.get("assignedByMe") === "true";
  const open = url.searchParams.get("open") === "true";

  const assigneeId = url.searchParams.get("assigneeId");
  const createdById = url.searchParams.get("createdById");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");
  /**
   * History asks a different question from the three tabs: not "what is on
   * me" but "what happened". `scope` is how it asks — byMe, toMe, or both
   * — because the two booleans it replaces could not express "both"
   * without meaning "tasks I assigned to myself".
   */
  const scope = url.searchParams.get("scope");

  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = Number(projectId);
  if (assigneeId) where.assigneeId = assigneeId;
  if (createdById) where.createdById = createdById;
  if (status && DOMAIN_TASK_STATUSES.includes(status as DomainTaskStatus)) {
    where.status = status;
  }
  const priority = url.searchParams.get("priority");
  if (priority && (DOMAIN_TASK_PRIORITIES as readonly string[]).includes(priority)) {
    where.priority = priority;
  }

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
  if (mine) {
    where.assigneeId = user.id;
  }
  if (scope === "byMe") {
    where.createdById = user.id;
  } else if (scope === "toMe") {
    where.assigneeId = user.id;
  } else if (scope === "both") {
    // Being named a reviewer is the third way a task is your business, and
    // leaving it out meant a reviewer could not find, anywhere in the app,
    // the work they had been put on the hook for.
    where.OR = [
      { assigneeId: user.id },
      { createdById: user.id },
      { reviewers: { some: { userId: user.id } } },
    ];
  }

  /**
   * Tasks naming me a reviewer, whatever state they are in.
   *
   * Distinct from `review=true`, which is the actionable queue and is
   * Submitted-only. This is the answer to "what am I on the hook for" —
   * asked the moment somebody names you, not weeks later when the work
   * finally lands. Without it, being made a reviewer was invisible until
   * the task arrived to be decided.
   */
  if (url.searchParams.get("reviewing") === "true") {
    where.reviewers = { some: { userId: user.id } };
  }

  /**
   * The approval queue: everything I can actually close.
   *
   * Named reviewers, plus whoever assigned it. Naming a reviewer adds
   * people who may sign off rather than removing the assigner, so the
   * queue holds both — otherwise it would hide work the API would happily
   * let them approve.
   *
   * Submitted only. A task still being worked on is not waiting on a
   * decision, and listing it would fill the queue with rows nobody can act
   * on until the count stopped meaning anything.
   */
  if (review) {
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      {
        OR: [
          { reviewers: { some: { userId: user.id } } },
          { createdById: user.id },
        ],
      },
    ];
    where.status = "Submitted";
  }

  if (assignedByMe) {
    where.createdById = user.id;
  }

  /**
   * What an Actionee or SME is allowed to see.
   *
   * This used to be a flat `assigneeId = me`, which was right when those
   * roles only ever received work. They can assign it now — to a
   * colleague, or to themselves — and the flat rule meant somebody could
   * hand out a task and then have nowhere to find it, because the one
   * filter that would have shown it was overwritten by their own role.
   *
   * The fence is still real; it is just drawn around the right set.
   * Assigned to me, raised by me, or waiting on my review — the three
   * ways a task can be my business. Anything else stays invisible.
   *
   * Last, and ANDed, so it narrows whatever the caller asked for rather
   * than replacing it. A scope filter must never widen what you can see.
   */
  if (user.role === "Actionee" || user.role === "SME") {
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      {
        OR: [
          { assigneeId: user.id },
          { createdById: user.id },
          { reviewers: { some: { userId: user.id } } },
        ],
      },
    ];
  }

  /**
   * Newest first by default; oldest first on request.
   *
   * The status grouping comes off when a sort is asked for. Ordering by
   * status and then by date means "oldest" returns the oldest Approved
   * task rather than the oldest task, which is not what anybody asking
   * for oldest means — and on a history screen the date is the axis
   * people are actually sorting on.
   */
  const sort = url.searchParams.get("sort");
  const orderBy =
    sort === "old"
      ? [{ createdAt: "asc" as const }]
      : sort === "new"
        ? [{ createdAt: "desc" as const }]
        : [{ status: "asc" as const }, { createdAt: "desc" as const }];

  const tasks = await prisma.domainTask.findMany({
    where,
    include: INCLUDE,
    orderBy,
    take: 500,
  });
  // Supervisors get the trail; everyone else gets the task alone.
  const rows = tasks.map((t) => serialize(t, SUPERVISOR_ROLES.includes(user.role)));
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

  /**
   * Handing work to someone else needs the authority to do it; recording
   * work you picked up yourself does not.
   *
   * The gate used to sit at the top of this route and refuse Actionees and
   * SMEs outright, which also refused them their own self-created tasks —
   * the one thing everybody is supposed to be able to log. Checked here
   * instead, once we know who the task is actually for.
   */
  if (assigneeId !== user.id && !canAssignTasks(user.role)) {
    return NextResponse.json(
      {
        error:
          "You can record work you've picked up yourself, but not assign it to someone else.",
      },
      { status: 403 },
    );
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  /**
   * Who is being asked to sign this off.
   *
   * Not the assignment ladder: an Actionee cannot hand work to their Lead
   * but should certainly be able to ask them to check it, so anyone active
   * may be named. The assignee is stripped out — approving your own work
   * is not review, and allowing it would make "assign to yourself, name
   * yourself" a way to close anything instantly while looking checked.
   */
  const reviewerIds = cleanReviewerIds(body.reviewerIds, assigneeId);
  if (reviewerIds.length > 0) {
    const found = await prisma.domainUser.findMany({
      where: { id: { in: reviewerIds }, isActive: true },
      select: { id: true },
    });
    if (found.length !== reviewerIds.length) {
      return NextResponse.json(
        { error: "One of those reviewers no longer has an active account." },
        { status: 400 },
      );
    }
  }

  /**
   * An assign date that was not given is today.
   *
   * Left null it read as "no date", and a task handed over on Tuesday
   * showed nothing at all where every other task showed a date — so the
   * list could not be ordered or filtered by when work went out.
   */
  const startDate = body.startDate
    ? new Date(String(body.startDate))
    : new Date();

  const created = await prisma.domainTask.create({
    data: {
      title,
      description,
      projectId,
      divisionId,
      assigneeId,
      createdById: user.id,
      status: "Assigned",
      reviewers: {
        create: reviewerIds.map((userId) => ({ userId })),
      },
      startDate,
      targetDate: body.targetDate ? new Date(String(body.targetDate)) : null,
      estimatedHours: parseEstimatedHours(body.estimatedHours),
      // Recorded as given. The hours themselves are already whatever the
      // assigner typed; this is the note that says which calendar they
      // were counting, so a 45h week-long task reads as deliberate.
      includesWeekends: body.includesWeekends === true,
      // Anything unrecognised lands on Medium rather than being rejected:
      // a bad priority is not a reason to refuse somebody's task.
      priority: normaliseTaskPriority(body.priority),
      // The first entry in the history: the brief, recorded as it was
      // given. Everything after this is appended, never edited.
      events: {
        create: {
          actorId: user.id,
          kind: "Assigned",
          note: description,
        },
      },
    },
    include: INCLUDE,
  });
  return NextResponse.json({ task: serialize(created, true) }, { status: 201 });
}