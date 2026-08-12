import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { toISODate } from "@/lib/forecast";

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
    },
  });
}

/** Remove a booking outright — for one added by mistake. */
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
  return NextResponse.json({ ok: true });
}
