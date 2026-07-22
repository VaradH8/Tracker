import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  MAX_BULK_TASKS,
  WORKING_ROLES,
  bulkTaskTitles,
  distributeEvenly,
  parseEstimatedHours,
  type DomainRole,
} from "@/lib/domain";

/**
 * Bulk-create a run of like-for-like tasks ("20 supports", "16 cables")
 * and spread them evenly over the people doing the work: 20 across 4
 * assignees is 5 each. Managers only.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));

  const prefix = String(body.titlePrefix ?? "").trim();
  if (!prefix) {
    return NextResponse.json(
      { error: "Give the batch a name, e.g. “Support”." },
      { status: 400 },
    );
  }

  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1) {
    return NextResponse.json(
      { error: "How many? Enter a whole number of 1 or more." },
      { status: 400 },
    );
  }
  if (count > MAX_BULK_TASKS) {
    return NextResponse.json(
      { error: `You can create at most ${MAX_BULK_TASKS} tasks at a time.` },
      { status: 400 },
    );
  }

  const projectId = Number(body.projectId);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Pick a project." }, { status: 400 });
  }
  const project = await prisma.domainProject.findUnique({
    where: { id: projectId },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Dedupe the picked assignees but keep the order the caller sent, so the
  // remainder lands predictably on the first names in the list.
  const requestedIds: string[] = Array.isArray(body.assigneeIds)
    ? Array.from(
        new Set<string>(body.assigneeIds.map((id: unknown) => String(id))),
      )
    : [];

  const assignees: { id: string; name: string }[] = [];
  if (requestedIds.length > 0) {
    const found = await prisma.domainUser.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true, name: true, role: true, isActive: true },
    });
    const byId = new Map(found.map((p) => [p.id, p]));
    for (const id of requestedIds) {
      const person = byId.get(id);
      if (!person || !person.isActive) {
        return NextResponse.json(
          { error: "One of the selected people no longer exists." },
          { status: 400 },
        );
      }
      if (!WORKING_ROLES.includes(person.role as DomainRole)) {
        return NextResponse.json(
          { error: "Tasks can only be assigned to Actionees, SMEs, or Team Leads." },
          { status: 400 },
        );
      }
      assignees.push({ id: person.id, name: person.name });
    }
  }

  const titles = bulkTaskTitles(prefix, count);
  const spread = distributeEvenly(count, assignees);
  const estimatedHours = parseEstimatedHours(body.estimatedHours);
  const startDate = body.startDate ? new Date(String(body.startDate)) : null;
  const targetDate = body.targetDate ? new Date(String(body.targetDate)) : null;

  await prisma.domainTask.createMany({
    data: titles.map((title, i) => ({
      title,
      projectId,
      assigneeId: spread[i]?.id ?? null,
      createdById: user.id,
      startDate,
      targetDate,
      estimatedHours,
    })),
  });

  // Report back what each person actually picked up, so the UI can show
  // "5 each to Asha, Ravi, Meena, Sam" rather than a bare success.
  const distribution = assignees.map((p) => ({
    assigneeId: p.id,
    name: p.name,
    count: spread.filter((a) => a?.id === p.id).length,
  }));

  return NextResponse.json({ created: count, distribution }, { status: 201 });
}
