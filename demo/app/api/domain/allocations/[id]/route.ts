import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { rateIssue, toISODate } from "@/lib/forecast";
import { removeTagsFromProject } from "@/lib/domain-tag-removal";

/**
 * Adjust or end a booking. Releasing someone early (`releasedAt`) frees
 * them in the forecast from that date without erasing the record that they
 * were on the project.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const allocation = await prisma.domainAllocation.findUnique({ where: { id } });
  if (!allocation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.startDate !== undefined) {
    const d = new Date(String(body.startDate));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
    }
    data.startDate = d;
  }
  if (body.endDate !== undefined) {
    const d = new Date(String(body.endDate));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid end date." }, { status: 400 });
    }
    data.endDate = d;
  }
  // null clears an early release and puts the person back on to the full window.
  if (body.releasedAt !== undefined) {
    if (body.releasedAt === null) {
      data.releasedAt = null;
    } else {
      const d = new Date(String(body.releasedAt));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid release date." }, { status: 400 });
      }
      data.releasedAt = d;
    }
  }

  // null clears the per-project rate and falls back to measured history.
  if (body.expectedTagsPerDay !== undefined) {
    if (body.expectedTagsPerDay === null || body.expectedTagsPerDay === "") {
      data.expectedTagsPerDay = null;
    } else {
      const issue = rateIssue(body.expectedTagsPerDay);
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
      const r = Number(body.expectedTagsPerDay);
      data.expectedTagsPerDay = Math.round(r * 100) / 100;
    }
  }

  const start = (data.startDate as Date) ?? allocation.startDate;
  const end = (data.endDate as Date) ?? allocation.endDate;
  if (end < start) {
    return NextResponse.json(
      { error: "The end date can't fall before the start date." },
      { status: 400 },
    );
  }

  const updated = await prisma.domainAllocation.update({
    where: { id },
    data,
    include: {
      project: { select: { name: true } },
      user: { select: { name: true, role: true } },
    },
  });

  return NextResponse.json({
    allocation: {
      id: updated.id,
      projectId: updated.projectId,
      projectName: updated.project.name,
      userId: updated.userId,
      userName: updated.user.name,
      userRole: updated.user.role,
      startDate: toISODate(updated.startDate),
      endDate: toISODate(updated.endDate),
      releasedAt: updated.releasedAt ? toISODate(updated.releasedAt) : null,
      expectedTagsPerDay: updated.expectedTagsPerDay,
    },
  });
}

/**
 * Take somebody off the project.
 *
 * The booking goes and their tags go with it. Leaving the tags behind is
 * what produced the "Holding tags without a booking" row nobody wanted:
 * removed from the allocation table, still on the project, still in its
 * totals.
 *
 * The tags are marked removed, not deleted, so the approval history
 * survives — see lib/domain-tag-removal.
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const existing = await prisma.domainAllocation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.domainAllocation.delete({ where: { id } });
  const removed = await removeTagsFromProject(
    existing.projectId,
    existing.userId,
    userOrResp.id,
  );
  // Reported back so the screen can say what actually left the project
  // rather than silently dropping a few thousand tags out of its totals.
  return NextResponse.json({ ok: true, removed });
}
