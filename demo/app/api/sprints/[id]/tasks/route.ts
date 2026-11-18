import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageProjectTasks, requireUser, writeAudit } from "@/lib/server-access";
import { loadUiSprint, serializeUiSprint } from "@/lib/sprints-ui";

const ids = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];

/** Move tasks into this sprint (`add`) or back to the backlog (`remove`).
 *  Only tasks of the sprint's own project. */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const sprint = await prisma.sprint.findUnique({
    where: { id },
    select: { projectId: true, name: true, project: { select: { name: true } } },
  });
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManageProjectTasks(user, sprint.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const add = ids(body.add);
  const remove = ids(body.remove).filter((t) => !add.includes(t));
  if (add.length + remove.length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  if (add.length) {
    const foreign = await prisma.task.count({
      where: { id: { in: add }, projectId: { not: sprint.projectId } },
    });
    if (foreign) {
      return NextResponse.json({ error: "Those tasks belong to a different project." }, { status: 400 });
    }
  }

  const [added, removed] = await prisma.$transaction([
    prisma.task.updateMany({ where: { id: { in: add }, projectId: sprint.projectId }, data: { sprintId: id } }),
    prisma.task.updateMany({ where: { id: { in: remove }, sprintId: id }, data: { sprintId: null } }),
  ]);
  const parts = [];
  if (added.count) parts.push(`added ${added.count} task${added.count === 1 ? "" : "s"}`);
  if (removed.count) parts.push(`moved ${removed.count} to backlog`);
  if (parts.length) {
    await writeAudit(user.id, "sprint.tasks", {
      scope: sprint.project.name,
      after: `${sprint.name}: ${parts.join(", ")}`,
    });
  }
  return NextResponse.json({ sprint: serializeUiSprint((await loadUiSprint(id))!, true) });
}

/** Open tasks of the sprint's project that aren't in it yet: the
 *  "Add tasks" picker. Backlog first, then tasks in other sprints. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const sprint = await prisma.sprint.findUnique({ where: { id }, select: { projectId: true } });
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManageProjectTasks(user, sprint.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tasks = await prisma.task.findMany({
    where: {
      projectId: sprint.projectId,
      // Paused (Hold) work isn't planned: move it back to an open status first.
      status: { notIn: ["Done", "Cancelled", "Hold"] },
      OR: [{ sprintId: null }, { sprintId: { not: id } }],
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      estimatedHours: true,
      sprint: { select: { name: true } },
    },
    orderBy: [{ sprintId: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: 300,
  });
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
      sprintName: t.sprint?.name ?? null,
    })),
  });
}
