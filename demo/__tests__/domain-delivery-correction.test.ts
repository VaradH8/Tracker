import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    domainTagAssignment: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    domainDeliveryCorrection: { create: vi.fn() },
    domainUser: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/domain-auth", () => ({
  requireDomainUser: vi.fn(),
  requireDomainRole: vi.fn(() => null),
}));

import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import { PATCH } from "@/app/api/domain/tag-assignments/[id]/route";

/**
 * Delivery normally moves one way only — submit, approve, total goes up —
 * and that is what makes the figure worth anything. An Admin may set it
 * directly, because a number that cannot be corrected is not trustworthy
 * either: work delivered before the system existed, a batch approved
 * twice, an import that landed short.
 *
 * What must hold: only an Admin, never without a stated reason, never
 * above what the batch carries, and never without a row saying who moved
 * it and from what.
 */

const ASSIGNMENT = {
  id: 7,
  projectId: 1,
  divisionId: null,
  assigneeId: "a1",
  assignedCount: 500,
  deliveredCount: 100,
  startDate: null,
  targetDate: null,
  project: { id: 1, name: "Metro", totalTags: 5000, divisions: [] },
};

function ctx() {
  return { params: Promise.resolve({ id: "7" }) };
}

function req(body: Record<string, unknown>) {
  return new Request("http://x/api/domain/tag-assignments/7", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function actingAs(role: string) {
  vi.mocked(requireDomainUser).mockResolvedValue({
    id: "me",
    name: "Me",
    role,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.domainTagAssignment.findUnique).mockResolvedValue(
    ASSIGNMENT as never,
  );
  vi.mocked(prisma.domainTagAssignment.findMany).mockResolvedValue([] as never);
  // $transaction gets an array of prepared operations; the route reads the
  // first result as the updated row and serialises it, so the shape has to
  // carry the relations INCLUDE would have loaded.
  const updatedRow = {
    ...ASSIGNMENT,
    division: null,
    assignee: { id: "a1", name: "Amit", role: "Actionee" },
    createdBy: { id: "me", name: "Me" },
    createdAt: new Date("2026-08-01"),
    complexity: "Simple",
  };
  vi.mocked(prisma.$transaction).mockImplementation(
    (async (ops: unknown[]) => ops.map(() => updatedRow)) as never,
  );
  vi.mocked(prisma.domainTagAssignment.update).mockReturnValue({} as never);
  vi.mocked(prisma.domainDeliveryCorrection.create).mockReturnValue({} as never);
});

describe("who may correct a delivered count", () => {
  it("refuses a Lead", async () => {
    actingAs("Lead");
    const res = await PATCH(
      req({ deliveredCount: 400, correctionReason: "backfill" }),
      ctx(),
    );
    expect(res.status).toBe(403);
    expect(prisma.domainDeliveryCorrection.create).not.toHaveBeenCalled();
  });

  it("refuses a Team Lead", async () => {
    actingAs("TeamLead");
    const res = await PATCH(
      req({ deliveredCount: 400, correctionReason: "backfill" }),
      ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("lets an Admin through", async () => {
    actingAs("Admin");
    const res = await PATCH(
      req({ deliveredCount: 400, correctionReason: "delivered pre-system" }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });
});

describe("what a correction costs", () => {
  beforeEach(() => actingAs("Admin"));

  it("refuses one with no reason given", async () => {
    const res = await PATCH(req({ deliveredCount: 400 }), ctx());
    expect(res.status).toBe(400);
    const body = await (res as NextResponse).json();
    expect(body.error).toMatch(/why/i);
  });

  it("refuses a blank reason", async () => {
    const res = await PATCH(
      req({ deliveredCount: 400, correctionReason: "   " }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("refuses more delivered than the batch carries", async () => {
    const res = await PATCH(
      req({ deliveredCount: 501, correctionReason: "typo" }),
      ctx(),
    );
    expect(res.status).toBe(400);
    const body = await (res as NextResponse).json();
    expect(body.error).toMatch(/only carries 500/i);
  });

  it("allows exactly the full batch", async () => {
    const res = await PATCH(
      req({ deliveredCount: 500, correctionReason: "all done offline" }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("refuses a negative or fractional figure", async () => {
    for (const bad of [-1, 12.5]) {
      const res = await PATCH(
        req({ deliveredCount: bad, correctionReason: "x" }),
        ctx(),
      );
      expect(res.status).toBe(400);
    }
  });

  it("allows zero — undoing a double approval", async () => {
    const res = await PATCH(
      req({ deliveredCount: 0, correctionReason: "approved twice" }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("writes the correction and the update in one transaction", async () => {
    await PATCH(
      req({ deliveredCount: 400, correctionReason: "delivered pre-system" }),
      ctx(),
    );
    // A figure that moved without its explanation is the exact thing this
    // is meant to prevent, so the two writes must not be separable.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown as unknown[];
    expect(ops).toHaveLength(2);
    expect(prisma.domainDeliveryCorrection.create).toHaveBeenCalledWith({
      data: {
        assignmentId: 7,
        before: 100,
        after: 400,
        reason: "delivered pre-system",
        actorId: "me",
      },
    });
  });

  it("records nothing when the figure did not actually change", async () => {
    const res = await PATCH(
      req({ deliveredCount: 100, correctionReason: "re-saved the form" }),
      ctx(),
    );
    // Nothing else was edited either, so there is nothing to do at all.
    expect(res.status).toBe(400);
    expect(prisma.domainDeliveryCorrection.create).not.toHaveBeenCalled();
  });
});

describe("ordinary edits", () => {
  it("still leave delivery alone when no correction is sent", async () => {
    actingAs("Lead");
    const res = await PATCH(req({ assignedCount: 600 }), ctx());
    expect(res.status).toBe(200);
    expect(prisma.domainDeliveryCorrection.create).not.toHaveBeenCalled();
    const ops = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown as unknown[];
    expect(ops).toHaveLength(1);
  });

  it("still refuse to shrink a batch below what is delivered", async () => {
    actingAs("Admin");
    const res = await PATCH(req({ assignedCount: 50 }), ctx());
    expect(res.status).toBe(400);
  });
});
