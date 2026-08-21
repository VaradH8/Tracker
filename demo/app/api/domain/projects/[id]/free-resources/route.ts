import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainRole, requireDomainUser } from "@/lib/domain-auth";
import { LIVE_ASSIGNMENT, totalTagPosition } from "@/lib/domain";

/**
 * Release everybody booked on a finished project.
 *
 * A project stops needing people the day its last tag is delivered, but
 * the bookings run to whatever end date somebody typed weeks earlier — so
 * the team stays "Allocated" on work that no longer exists, and Resource
 * availability quietly under-reports who is free to take the next job.
 *
 * This is the opposite of removing somebody. Removing says "you were not
 * on this after all" and takes the undelivered work back; this says "you
 * finished, you are free". So only the bookings go. Tag assignments stay
 * exactly as they are, which means the project keeps its delivered
 * figures, every submission stays in Approvals, and each person keeps
 * their own record of what they did here.
 *
 * Refused on a project that is not finished: freeing people off work that
 * is still outstanding is a mistake, not a shortcut, and the honest fix
 * for a wrong end date is to edit the booking.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const project = await prisma.domainProject.findUnique({
    where: { id },
    include: {
      allocations: { select: { id: true, userId: true } },
      tagAssignments: {
        select: { assignedCount: true, deliveredCount: true, removedAt: true },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const position = totalTagPosition(project.tagAssignments);
  const total = project.totalTags > 0 ? project.totalTags : position.assigned;
  const outstanding = Math.max(0, total - position.delivered);

  if (total === 0) {
    return NextResponse.json(
      { error: "This project has no tags set up, so there is nothing finished to free anyone from." },
      { status: 400 },
    );
  }
  if (outstanding > 0) {
    return NextResponse.json(
      {
        error: `${outstanding} tags are still outstanding here. Free people up once the project is delivered — to end one booking early, edit it in Resource allocation.`,
      },
      { status: 400 },
    );
  }
  if (project.allocations.length === 0) {
    return NextResponse.json(
      { error: "Nobody is booked on this project." },
      { status: 400 },
    );
  }

  // Bookings only. Everything that records what was done here is left
  // untouched — see the note at the top of this file.
  const { count } = await prisma.domainAllocation.deleteMany({
    where: { projectId: id },
  });

  /**
   * Who is genuinely free now, so the screen can say so rather than
   * claiming it. Somebody released here may still be booked elsewhere, or
   * still holding open tags on another project.
   */
  const freed = await prisma.domainUser.findMany({
    where: { id: { in: project.allocations.map((a) => a.userId) } },
    select: {
      id: true,
      name: true,
      allocations: { select: { id: true } },
      tagAssignments: {
        where: LIVE_ASSIGNMENT,
        select: { assignedCount: true, deliveredCount: true },
      },
    },
  });
  const nowFree = freed.filter(
    (u) =>
      u.allocations.length === 0 &&
      u.tagAssignments.reduce(
        (s, a) => s + Math.max(0, a.assignedCount - a.deliveredCount),
        0,
      ) === 0,
  );

  return NextResponse.json({
    ok: true,
    released: count,
    freeNow: nowFree.map((u) => u.name),
    stillBusy: freed.length - nowFree.length,
  });
}
