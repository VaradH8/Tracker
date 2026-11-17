import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageProjectTasks, requireUser } from "@/lib/server-access";
import { updateSprint } from "@/lib/api-v1/sprints";
import { toErrorResponse } from "@/lib/api-v1/handler";
import { loadUiSprint, serializeUiSprint } from "@/lib/sprints-ui";

/** Rename, re-date, re-goal, or start / close a sprint. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.goal !== undefined) patch.goal = body.goal;
  if (body.status !== undefined) patch.status = body.status;
  if (body.startDate !== undefined) patch.start_date = body.startDate;
  if (body.endDate !== undefined) patch.end_date = body.endDate;
  try {
    await updateSprint(id, patch, user, null);
    return NextResponse.json({ sprint: serializeUiSprint((await loadUiSprint(id))!, true) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Sprints are never deleted: close them instead. */
export function DELETE() {
  return NextResponse.json({ error: "Sprints can't be deleted; close them instead." }, { status: 405 });
}
