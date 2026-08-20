import { prisma } from "@/lib/db";
import { LIVE_ASSIGNMENT } from "@/lib/domain";

/**
 * Taking somebody off a project. Two different acts, deliberately kept
 * apart, because one is reversible and the other is not.
 *
 * REMOVE — they leave, the record stays.
 *   Their assignments are marked removed. They disappear from the project
 *   and the project disappears from them, and they go back to Free if
 *   nothing else holds them. What they submitted stays in Approvals,
 *   attached to this project, because a Lead approved it and that decision
 *   happened. This is what you want almost every time.
 *
 * DELETE — they were never here.
 *   Assignments, submissions and delivery corrections are destroyed, on
 *   both sides: gone from Approvals, gone from the actionee's own
 *   submission history. For work logged against the wrong project, or a
 *   person added by mistake — the cases where leaving a trail would be
 *   leaving a lie. Admin only, and it cannot be undone.
 *
 * Assignments are marked rather than deleted in the first case because
 * every submission hangs off the assignment by a cascading foreign key: a
 * delete takes the approval history with it, which is precisely the
 * difference between the two operations.
 */

export type RemovalSummary = {
  assignments: number;
  assignedTags: number;
  deliveredTags: number;
  /** Everything they submitted against this project, decided or not. */
  submissions: number;
  /** Manual corrections an Admin made to those delivered figures. */
  corrections: number;
  /** Tasks on this project still assigned to them. */
  tasks: number;
};

const EMPTY: RemovalSummary = {
  assignments: 0,
  assignedTags: 0,
  deliveredTags: 0,
  submissions: 0,
  corrections: 0,
  tasks: 0,
};

/**
 * What removing or deleting this person would take off the project,
 * without doing either.
 *
 * `live` counts only what is still current — what Remove would take. The
 * submission and correction counts span removed assignments too, because
 * Delete reaches those as well, and the confirmation has to state the real
 * number or it is not a confirmation.
 */
export async function removalImpact(
  projectId: number,
  userId: string,
): Promise<RemovalSummary & { everAssigned: number }> {
  const [live, everRows, submissions, corrections, tasks] = await Promise.all([
    prisma.domainTagAssignment.findMany({
      where: { projectId, assigneeId: userId, ...LIVE_ASSIGNMENT },
      select: { assignedCount: true, deliveredCount: true },
    }),
    prisma.domainTagAssignment.findMany({
      where: { projectId, assigneeId: userId },
      select: { id: true },
    }),
    prisma.domainTagSubmission.count({
      where: { assignment: { projectId, assigneeId: userId } },
    }),
    prisma.domainDeliveryCorrection.count({
      where: { assignment: { projectId, assigneeId: userId } },
    }),
    prisma.domainTask.count({ where: { projectId, assigneeId: userId } }),
  ]);

  return {
    assignments: live.length,
    assignedTags: live.reduce((s, r) => s + r.assignedCount, 0),
    deliveredTags: live.reduce((s, r) => s + r.deliveredCount, 0),
    submissions,
    corrections,
    tasks,
    /** Including ones already removed — what Delete would reach. */
    everAssigned: everRows.length,
  };
}

/**
 * REMOVE. Take this person off the project without destroying anything.
 *
 * Their live assignments are marked, and their booking is released — both,
 * because "off the project" has to mean the same thing whether they were
 * formally booked or only holding tags. Releasing the booking is also what
 * puts them back to Free: availability is computed from bookings and open
 * tags, so leaving the booking behind would show them busy on a project
 * they are no longer on.
 *
 * Nothing is destroyed, so this is the safe default and the one offered to
 * Leads and Team Leads.
 *
 * Idempotent on both halves, which matters because the allocation route
 * deletes the booking itself and then calls this.
 */
export async function removeTagsFromProject(
  projectId: number,
  userId: string,
  actorId: string,
): Promise<RemovalSummary & { releasedBooking: boolean }> {
  const impact = await removalImpact(projectId, userId);
  const [, booking] = await prisma.$transaction([
    prisma.domainTagAssignment.updateMany({
      where: { projectId, assigneeId: userId, ...LIVE_ASSIGNMENT },
      data: { removedAt: new Date(), removedById: actorId },
    }),
    prisma.domainAllocation.deleteMany({ where: { projectId, userId } }),
  ]);
  return {
    assignments: impact.assignments,
    assignedTags: impact.assignedTags,
    deliveredTags: impact.deliveredTags,
    submissions: impact.submissions,
    corrections: impact.corrections,
    tasks: impact.tasks,
    releasedBooking: booking.count > 0,
  };
}

/**
 * DELETE. Destroy this person's tag work on this project, everywhere.
 *
 * Assignments go, and submissions and delivery corrections go with them by
 * cascade — so the rows vanish from Approvals and from the person's own
 * submission history in the same stroke. Their booking goes too, so the
 * project stops listing them.
 *
 * Tasks are unassigned rather than deleted. A task is a different kind of
 * record with its own event history, and nobody asked for that to be
 * destroyed; unassigning is enough to take the project off their screens,
 * which is what was asked. The count is reported either way so the
 * confirmation can say what will happen to them.
 *
 * One transaction: a half-deleted person is worse than either state.
 */
export async function purgeFromProject(
  projectId: number,
  userId: string,
): Promise<RemovalSummary> {
  const impact = await removalImpact(projectId, userId);
  if (impact.everAssigned === 0 && impact.tasks === 0) return { ...EMPTY };

  await prisma.$transaction([
    // Explicit rather than relying on the cascade alone: the intent of
    // this function is that these rows are gone, and that should be
    // readable here rather than inferred from the schema.
    prisma.domainDeliveryCorrection.deleteMany({
      where: { assignment: { projectId, assigneeId: userId } },
    }),
    prisma.domainTagSubmission.deleteMany({
      where: { assignment: { projectId, assigneeId: userId } },
    }),
    prisma.domainTagAssignment.deleteMany({
      where: { projectId, assigneeId: userId },
    }),
    prisma.domainAllocation.deleteMany({ where: { projectId, userId } }),
    prisma.domainTask.updateMany({
      where: { projectId, assigneeId: userId },
      data: { assigneeId: null },
    }),
  ]);

  return {
    assignments: impact.everAssigned,
    assignedTags: impact.assignedTags,
    deliveredTags: impact.deliveredTags,
    submissions: impact.submissions,
    corrections: impact.corrections,
    tasks: impact.tasks,
  };
}
