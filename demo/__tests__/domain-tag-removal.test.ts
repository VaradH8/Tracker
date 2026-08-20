import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    domainTagAssignment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    domainTagSubmission: { count: vi.fn(), deleteMany: vi.fn() },
    domainDeliveryCorrection: { count: vi.fn(), deleteMany: vi.fn() },
    domainAllocation: { deleteMany: vi.fn() },
    domainTask: { count: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { LIVE_ASSIGNMENT } from "@/lib/domain";
import {
  purgeFromProject,
  removalImpact,
  removeTagsFromProject,
} from "@/lib/domain-tag-removal";

/**
 * Taking somebody off a project takes their tags with them.
 *
 * Removing a booking used to leave the tags behind: the person dropped out
 * of the allocation table and reappeared below it as "holding tags without
 * a booking", still counted in the project's totals and still carrying the
 * work on their own screens.
 *
 * The rows are marked, not deleted. Every submission hangs off the
 * assignment by a cascading foreign key, so deleting would take the
 * approval history with it — and the history is the one thing that must
 * survive somebody leaving.
 */

const ROWS = [
  { assignedCount: 212, deliveredCount: 212 },
  { assignedCount: 2440, deliveredCount: 2440 },
  { assignedCount: 2205, deliveredCount: 2205 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.domainTagAssignment.findMany).mockResolvedValue(
    ROWS as never,
  );
  vi.mocked(prisma.domainTagAssignment.updateMany).mockResolvedValue({
    count: 3,
  } as never);
  vi.mocked(prisma.domainTagSubmission.count).mockResolvedValue(26 as never);
  vi.mocked(prisma.domainDeliveryCorrection.count).mockResolvedValue(1 as never);
  vi.mocked(prisma.domainTask.count).mockResolvedValue(2 as never);
  // The helpers run their writes as an array transaction and read the
  // counts back off the results.
  vi.mocked(prisma.$transaction).mockResolvedValue([
    { count: 3 },
    { count: 1 },
  ] as never);
});

describe("what removal takes off the project", () => {
  it("adds up every batch the person holds there", async () => {
    const impact = await removalImpact(92, "u1");
    expect(impact).toMatchObject({
      assignments: 3,
      assignedTags: 4857,
      deliveredTags: 4857,
    });
  });

  it("states what Delete would reach, not just what Remove would", async () => {
    // The confirmation has to say the real number or it is not a
    // confirmation: submissions and corrections span already-removed
    // assignments, which Delete destroys and Remove never touches.
    const impact = await removalImpact(92, "u1");
    expect(impact.submissions).toBe(26);
    expect(impact.corrections).toBe(1);
    expect(impact.tasks).toBe(2);
    expect(impact.everAssigned).toBe(3);
  });

  it("counts only live rows, so a second removal is not double-counted", async () => {
    await removalImpact(92, "u1");
    const where = vi.mocked(prisma.domainTagAssignment.findMany).mock
      .calls[0][0]?.where;
    expect(where).toMatchObject({ projectId: 92, assigneeId: "u1" });
    expect(where).toMatchObject(LIVE_ASSIGNMENT);
  });
});

describe("removing them", () => {
  it("marks the rows rather than deleting them", async () => {
    // The whole point. A delete cascades to DomainTagSubmission and takes
    // the approval history with it.
    await removeTagsFromProject(92, "u1", "admin");
    expect(prisma.domainTagAssignment.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.domainTagAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.domainTagSubmission.deleteMany).not.toHaveBeenCalled();
  });

  it("releases the booking, so they go back to Free", async () => {
    // Availability is computed from bookings and open tags. Leaving the
    // booking behind would show them busy on a project they are off.
    await removeTagsFromProject(92, "u1", "admin");
    expect(prisma.domainAllocation.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 92, userId: "u1" },
    });
  });

  it("records who did it and when", async () => {
    await removeTagsFromProject(92, "u1", "admin");
    const call = vi.mocked(prisma.domainTagAssignment.updateMany).mock
      .calls[0][0];
    expect(call.data).toMatchObject({ removedById: "admin" });
    expect(call.data).toHaveProperty("removedAt");
    expect((call.data as { removedAt: Date }).removedAt).toBeInstanceOf(Date);
  });

  it("reports what left, so the screen can say so", async () => {
    const impact = await removeTagsFromProject(92, "u1", "admin");
    expect(impact.assignedTags).toBe(4857);
  });

  it("still releases the booking of somebody holding no tags", async () => {
    // A person can be booked on a project without carrying a batch yet.
    // An early return on "no assignments" left their booking in place and
    // the project still listing them, which is not what Remove means.
    vi.mocked(prisma.domainTagAssignment.findMany).mockResolvedValue(
      [] as never,
    );
    const impact = await removeTagsFromProject(92, "u1", "admin");
    expect(impact.assignments).toBe(0);
    expect(prisma.domainAllocation.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 92, userId: "u1" },
    });
    // The mark is still issued; it simply matches no rows.
    expect(prisma.domainTagAssignment.updateMany).toHaveBeenCalled();
  });

  it("touches only this person on this project", async () => {
    await removeTagsFromProject(92, "u1", "admin");
    const where = vi.mocked(prisma.domainTagAssignment.updateMany).mock
      .calls[0][0].where;
    expect(where).toMatchObject({ projectId: 92, assigneeId: "u1" });
    // Already-removed rows are left alone, so an earlier removal keeps the
    // date it actually happened on.
    expect(where).toMatchObject(LIVE_ASSIGNMENT);
  });
});

describe("deleting them", () => {
  it("destroys the submissions and the corrections, not just the rows", async () => {
    // Remove and Delete differ in exactly this: whether the approval
    // history outlives the person leaving.
    await purgeFromProject(92, "u1");
    const ops = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown as unknown[];
    expect(ops).toHaveLength(5);
    expect(prisma.domainDeliveryCorrection.deleteMany).toHaveBeenCalledWith({
      where: { assignment: { projectId: 92, assigneeId: "u1" } },
    });
    expect(prisma.domainTagSubmission.deleteMany).toHaveBeenCalledWith({
      where: { assignment: { projectId: 92, assigneeId: "u1" } },
    });
    expect(prisma.domainTagAssignment.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 92, assigneeId: "u1" },
    });
  });

  it("reaches assignments that were already removed", async () => {
    // Somebody removed last month and deleted today must not leave half
    // their history behind.
    const summary = await purgeFromProject(92, "u1");
    expect(summary.assignments).toBe(3);
    expect(prisma.domainTagAssignment.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 92, assigneeId: "u1" },
    });
  });

  it("unassigns their tasks rather than destroying them", async () => {
    // A task is a different record with its own event history, and nobody
    // asked for that to go. Unassigning is enough to take the project off
    // their screens, which is what was asked.
    await purgeFromProject(92, "u1");
    expect(prisma.domainTask.updateMany).toHaveBeenCalledWith({
      where: { projectId: 92, assigneeId: "u1" },
      data: { assigneeId: null },
    });
  });

  it("does nothing at all when they have nothing here", async () => {
    vi.mocked(prisma.domainTagAssignment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainTask.count).mockResolvedValue(0 as never);
    const summary = await purgeFromProject(92, "u1");
    expect(summary.assignments).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("the live filter itself", () => {
  it("is a null check, not a boolean flag", () => {
    // Nullable timestamp rather than isActive: the column doubles as the
    // record of when it happened, and needs no backfill on deploy.
    expect(LIVE_ASSIGNMENT).toEqual({ removedAt: null });
  });
});
