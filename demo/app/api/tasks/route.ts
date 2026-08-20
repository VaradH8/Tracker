import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assigneesOutsideProject,
  canCreateProjectTasks,
  canSeeAllProjectTasks,
  forkableTasksFilter,
  notifyUser,
  requireUser,
  rosteredProjectIds,
  taskAssignmentFilter,
  userByFirstName,
  visibleProjectIds,
  writeAudit,
} from "@/lib/server-access";
import { serializeTask } from "@/lib/serializers";

const TASK_INCLUDE = {
  assignees: { include: { user: true } },
  responsible: true,
  approvedBy: true,
  remarks: { include: { author: true }, orderBy: { createdAt: "asc" as const } },
  attachments: { include: { uploadedBy: true } },
  blockedBy: true,
} as const;

export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const mineOnly = url.searchParams.get("mine") === "true";
  const forkable = url.searchParams.get("forkable") === "true";

  const ids = await visibleProjectIds(user);
  const where: Record<string, unknown> = {};
  if (ids !== "all") where.projectId = { in: ids };
  if (projectId) where.projectId = Number(projectId);
  if (forkable) {
    // Read-only feed of colleagues' work on the caller's own projects, so a
    // developer has something to fork. Their own tasks are excluded — the
    // board already shows those.
    //
    // Scoped to the projects they are *rostered* on, not the wider
    // visibleProjectIds: forking requires membership, so anything outside
    // the roster would show a Fork button that the endpoint then refuses.
    // Admins keep the god view.
    if (ids !== "all") {
      where.projectId = { in: await rosteredProjectIds(user.id) };
    }
    Object.assign(where, forkableTasksFilter(user.id));
  } else if (mineOnly) {
    // Explicit "assigned to me" filter — strictly assignees.
    where.assignees = { some: { userId: user.id } };
  } else if (!canSeeAllProjectTasks(user.role)) {
    // Assignment-based visibility: non-oversight roles (Developer, BD)
    // only see their own tasks even within a project they can access,
    // rather than the whole project board.
    Object.assign(where, taskAssignmentFilter(user.id));
  }

  const tasks = await prisma.task.findMany({
    where,
    include: TASK_INCLUDE,
    orderBy: [{ important: "desc" }, { targetDate: "asc" }],
  });

  return NextResponse.json({ tasks: tasks.map(serializeTask) });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const projectId = Number(body.projectId);
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Pick a project." }, { status: 400 });
  }
  // Per-project authority: anyone who is a Lead or Coordinator on this
  // specific project can create tasks, even if their global role is BD
  // or Developer. A BusinessDeveloper rostered on the project (e.g. the
  // BD who created it) may also add tasks — but assigning developers to
  // them stays with the Lead/Coordinator.
  if (!(await canCreateProjectTasks(user, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // First names from the client → resolve to user ids.
  const assigneeNames: string[] = Array.isArray(body.assignees)
    ? body.assignees
    : [];
  const assigneeUsers = await Promise.all(
    assigneeNames.map((n) => userByFirstName(String(n))),
  );
  const validAssignees = assigneeUsers.filter(
    (u): u is NonNullable<typeof u> => u !== null,
  );

  // A Developer may only hand work to the project's own roster, and is
  // always the responsible owner of what they raise — they cannot pin
  // accountability on somebody else. Oversight roles keep their existing
  // freedom to assign and to name a different responsible owner.
  if (user.role === "Developer") {
    const outside = await assigneesOutsideProject(
      projectId,
      validAssignees.map((u) => u.id),
    );
    if (outside.length) {
      return NextResponse.json(
        { error: "You can only assign people who are on this project." },
        { status: 403 },
      );
    }
  }

  const responsibleFirst = body.responsible ? String(body.responsible) : null;
  const responsibleUser =
    user.role === "Developer"
      ? null
      : responsibleFirst
        ? await userByFirstName(responsibleFirst)
        : null;

  const task = await prisma.task.create({
    data: {
      title,
      description: body.description ?? null,
      projectId,
      status: String(body.status ?? "To Do"),
      priority: String(body.priority ?? "Medium"),
      targetDate: body.targetDate
        ? new Date(String(body.targetDate))
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      startDate: body.startDate ? new Date(String(body.startDate)) : null,
      estimatedHours:
        typeof body.estimatedHours === "number"
          ? body.estimatedHours
          : null,
      important: Boolean(body.important),
      responsibleId: responsibleUser?.id ?? user.id,
      assignees: validAssignees.length
        ? {
            create: validAssignees.map((u) => ({ userId: u.id })),
          }
        : undefined,
    },
    include: { ...TASK_INCLUDE, project: true },
  });

  await writeAudit(user.id, "task.create", {
    scope: task.project.name,
    taskTitle: task.title,
  });

  // Notify everyone assigned at creation time (in-app + EmailLog + SMTP).
  // Assigning via the drawer later goes through POST /api/notifications;
  // this covers the create-with-assignees path, which previously fired
  // nothing at all. Skip the creator — no point notifying yourself.
  await Promise.all(
    validAssignees
      .filter((u) => u.id !== user.id)
      .map((u) =>
        notifyUser(u.id, {
          kind: "assigned",
          title: "Assigned to a task",
          body: task.title,
          taskId: task.id,
          actorName: user.name,
          baseUrl: new URL(req.url).origin,
        }),
      ),
  );

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
