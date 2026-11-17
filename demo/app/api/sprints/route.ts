import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageProjectTasks, requireUser, visibleProjectIds } from "@/lib/server-access";
import { createSprint } from "@/lib/api-v1/sprints";
import { toErrorResponse } from "@/lib/api-v1/handler";
import { UI_SPRINT_INCLUDE, loadUiSprint, serializeUiSprint } from "@/lib/sprints-ui";

/** Sprints in the projects this person can see, newest first. */
export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const ids = await visibleProjectIds(user);
  const projectId = Number(new URL(req.url).searchParams.get("projectId"));
  const where =
    Number.isInteger(projectId) && projectId > 0
      ? ids === "all" || ids.includes(projectId)
        ? { projectId }
        : { projectId: -1 }
      : ids === "all"
        ? {}
        : { projectId: { in: ids } };

  const sprints = await prisma.sprint.findMany({
    where,
    include: UI_SPRINT_INCLUDE,
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });
  const manage = new Map<number, boolean>();
  for (const pid of new Set(sprints.map((s) => s.projectId))) {
    manage.set(pid, await canManageProjectTasks(user, pid));
  }
  return NextResponse.json({
    sprints: sprints.map((s) => serializeUiSprint(s, manage.get(s.projectId) ?? false)),
  });
}

/** Create a sprint. Admin / Lead / Co-ordinator, or the project's own
 *  Lead / Co-ordinator. */
export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId < 1) {
    return NextResponse.json({ error: "Pick a project." }, { status: 400 });
  }
  if (!(await canManageProjectTasks(user, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const created = await createSprint(
      {
        project_id: projectId,
        name: body.name,
        goal: body.goal ?? null,
        start_date: body.startDate,
        end_date: body.endDate,
        status: body.status ?? "planned",
      },
      user,
      null,
    );
    const row = await loadUiSprint(created.id);
    return NextResponse.json({ sprint: serializeUiSprint(row!, true) }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
