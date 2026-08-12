import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { toISODate } from "@/lib/forecast";

/**
 * Lead review of a claimed tag count — the hinge the whole feature turns
 * on. Approving is the ONLY thing that moves `deliveredCount`, and it does
 * so in the same transaction as the status change so the two can never
 * drift apart. Everything downstream (project delivered totals, per-person
 * rates, projected delivery dates) is derived from those numbers, so the
 * forecast updates itself the moment a Lead approves.
 *
 * Approvers are any Lead or Admin. Team Leads and SMEs can hold tags
 * themselves, so letting them approve would let work sign itself off.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: 'Action must be "approve" or "reject".' },
      { status: 400 },
    );
  }

  const submission = await prisma.domainTagSubmission.findUnique({
    where: { id },
    include: { assignment: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (submission.status !== "Pending") {
    return NextResponse.json(
      { error: `This submission was already ${submission.status.toLowerCase()}.` },
      { status: 409 },
    );
  }

  const reviewNote =
    typeof body.reviewNote === "string" && body.reviewNote.trim()
      ? body.reviewNote.trim()
      : null;

  if (action === "reject") {
    const updated = await prisma.domainTagSubmission.update({
      where: { id },
      data: {
        status: "Rejected",
        approvedCount: 0,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote,
      },
      include: { assignment: true },
    });
    return NextResponse.json({
      submission: {
        id: updated.id,
        status: updated.status,
        approvedCount: updated.approvedCount,
        date: toISODate(updated.date),
        deliveredCount: updated.assignment.deliveredCount,
      },
    });
  }

  // A Lead can sign off fewer tags than were claimed ("I verified 60 of
  // your 70"). Absent an explicit number, the claim stands as-is.
  const approvedCount =
    body.approvedCount === undefined || body.approvedCount === null
      ? submission.completedCount
      : Number(body.approvedCount);
  if (!Number.isInteger(approvedCount) || approvedCount < 0) {
    return NextResponse.json(
      { error: "Approved count must be a whole number of 0 or more." },
      { status: 400 },
    );
  }
  if (approvedCount > submission.completedCount) {
    return NextResponse.json(
      { error: "You can't approve more tags than were submitted." },
      { status: 400 },
    );
  }

  const headroom =
    submission.assignment.assignedCount - submission.assignment.deliveredCount;
  if (approvedCount > headroom) {
    return NextResponse.json(
      { error: `Only ${headroom} tag(s) remain on this assignment.` },
      { status: 400 },
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.domainTagSubmission.update({
      where: { id },
      data: {
        status: "Approved",
        approvedCount,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote,
      },
    }),
    prisma.domainTagAssignment.update({
      where: { id: submission.assignmentId },
      data: { deliveredCount: { increment: approvedCount } },
    }),
  ]);

  const assignment = await prisma.domainTagAssignment.findUnique({
    where: { id: submission.assignmentId },
    select: { assignedCount: true, deliveredCount: true, projectId: true },
  });

  return NextResponse.json({
    submission: {
      id: updated.id,
      status: updated.status,
      approvedCount: updated.approvedCount,
      date: toISODate(updated.date),
      deliveredCount: assignment?.deliveredCount ?? 0,
      assignedCount: assignment?.assignedCount ?? 0,
      projectId: assignment?.projectId ?? null,
    },
  });
}
