import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    domainProject: { findUnique: vi.fn(), update: vi.fn() },
    domainDivision: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    domainProjectDivision: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
    },
    domainTagAssignment: {
      count: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
    },
    domainAllocation: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/domain-auth", () => ({
  requireDomainUser: vi.fn(),
  requireDomainRole: vi.fn(() => null),
}));
vi.mock("@/lib/domain-schedule", () => ({
  holidaySet: vi.fn(async () => new Set<string>()),
  dayToDate: (d: string) => new Date(d),
}));

import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import { PATCH } from "@/app/api/domain/projects/[id]/route";

/**
 * Renaming a division that a project already has.
 *
 * The route matched on `divisionId` and dropped `name` on the floor, so
 * editing a division's name in the project form saved cleanly, returned
 * 200, and changed nothing. Silent, which is the worst way for an edit to
 * fail — there is nothing on screen to argue with.
 *
 * Divisions are a shared catalogue: one row linked to however many
 * projects use it, because typing "Piping" on a second project finds the
 * existing row rather than making another. A rename therefore means one of
 * two things, and it means "this project's division is now called X" — so
 * a shared row is left where it is and this project moves onto its own,
 * taking its tags with it.
 */

const PROJECT = {
  id: 92,
  name: "Pune Metro Line 3",
  totalTags: 1200,
  startDate: null,
  handoverDate: null,
  workingDaysPerWeek: null,
  totalWorkingDays: null,
  contractTags: null,
  divisions: [{ divisionId: 58, totalTags: 600 }],
};

const CATALOGUE = [
  { id: 58, name: "Electrical" },
  { id: 59, name: "Piping" },
];

function ctx() {
  return { params: Promise.resolve({ id: "92" }) };
}

function req(body: Record<string, unknown>) {
  return new Request("http://x/api/domain/projects/92", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** The shape EditProjectForm sends: existing ids, plus whatever is typed. */
function withDivisionName(name: string) {
  return {
    name: PROJECT.name,
    totalTags: PROJECT.totalTags,
    divisions: [{ divisionId: 58, name, totalTags: 600 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDomainUser).mockResolvedValue({
    id: "admin",
    name: "Admin",
    role: "Admin",
  } as never);
  vi.mocked(prisma.domainDivision.findMany).mockResolvedValue(
    CATALOGUE.map((d) => ({ ...d })) as never,
  );
  vi.mocked(prisma.domainProjectDivision.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.domainTagAssignment.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.domainTagAssignment.aggregate).mockResolvedValue({
    _sum: { assignedCount: 0 },
  } as never);
  vi.mocked(prisma.domainDivision.update).mockResolvedValue({
    id: 58,
    name: "renamed",
  } as never);
  vi.mocked(prisma.domainTagAssignment.updateMany).mockResolvedValue({
    count: 1,
  } as never);
  // The route runs its writes inside an interactive transaction and then
  // re-reads the project to serialise it, so the callback is invoked with
  // the same mocked client and findUnique has to answer twice: once for
  // the `current` lookup, once for the response.
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: unknown) =>
    typeof fn === "function"
      ? await (fn as (tx: unknown) => Promise<unknown>)(prisma)
      : []) as never);
  const serialisable = {
    ...PROJECT,
    owner: { id: "o", name: "Owner" },
    _count: { tasks: 0 },
    createdAt: new Date(),
    client: null,
    description: null,
    divisions: [],
    allocations: [],
    tagAssignments: [],
  };
  vi.mocked(prisma.domainProject.findUnique)
    .mockResolvedValueOnce(PROJECT as never)
    .mockResolvedValue(serialisable as never);
  vi.mocked(prisma.domainProject.update).mockResolvedValue(
    serialisable as never,
  );
});

describe("renaming a division the project already has", () => {
  it("writes the new name", async () => {
    const res = await PATCH(req(withDivisionName("Electrical & Instrumentation")), ctx());
    expect(res.status).toBe(200);
    expect(prisma.domainDivision.update).toHaveBeenCalledWith({
      where: { id: 58 },
      data: { name: "Electrical & Instrumentation" },
      select: { id: true, name: true },
    });
  });

  it("does nothing when the name has not changed", async () => {
    // Every ordinary save resends every division. Renaming on each one
    // would churn the catalogue and log a change that never happened.
    const res = await PATCH(req(withDivisionName("Electrical")), ctx());
    expect(res.status).toBe(200);
    expect(prisma.domainDivision.update).not.toHaveBeenCalled();
  });

  it("moves this project onto its own division when the row is shared", async () => {
    vi.mocked(prisma.domainProjectDivision.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.domainDivision.create).mockResolvedValue({
      id: 77,
      name: "Cabling",
    } as never);

    const res = await PATCH(req(withDivisionName("Cabling")), ctx());
    expect(res.status).toBe(200);
    // The shared row is left exactly as it was, so nobody else's project
    // is retitled behind them.
    expect(prisma.domainDivision.update).not.toHaveBeenCalled();
    expect(prisma.domainDivision.create).toHaveBeenCalledWith({
      data: { name: "Cabling" },
      select: { id: true, name: true },
    });
  });

  it("takes this project's tags across with it", async () => {
    vi.mocked(prisma.domainProjectDivision.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.domainDivision.create).mockResolvedValue({
      id: 77,
      name: "Cabling",
    } as never);

    await PATCH(req(withDivisionName("Cabling")), ctx());
    // Scoped to this project: the other project's tags stay on the old
    // division, which is the whole point of not renaming it.
    expect(prisma.domainTagAssignment.updateMany).toHaveBeenCalledWith({
      where: { projectId: 92, divisionId: 58 },
      data: { divisionId: 77 },
    });
  });

  it("reuses an existing row rather than making a second one with that name", async () => {
    vi.mocked(prisma.domainProjectDivision.count).mockResolvedValue(2 as never);
    // "Piping" already exists and this project does not have it.
    const res = await PATCH(req(withDivisionName("Piping")), ctx());
    expect(res.status).toBe(200);
    expect(prisma.domainDivision.create).not.toHaveBeenCalled();
    expect(prisma.domainTagAssignment.updateMany).toHaveBeenCalledWith({
      where: { projectId: 92, divisionId: 58 },
      data: { divisionId: 59 },
    });
  });

  it("refuses a name this project already has, rather than merging silently", async () => {
    // Two sets of tags becoming one is a different operation, and not one
    // anybody asked for by typing in a name field.
    vi.mocked(prisma.domainProject.findUnique).mockReset();
    const withBoth = {
      ...PROJECT,
      divisions: [
        { divisionId: 58, totalTags: 600 },
        { divisionId: 59, totalTags: 400 },
      ],
    };
    vi.mocked(prisma.domainProject.findUnique).mockResolvedValue(
      withBoth as never,
    );
    const res = await PATCH(req(withDivisionName("Piping")), ctx());
    expect(res.status).toBe(400);
    const body = await (res as NextResponse).json();
    expect(body.error).toMatch(/already has a division called/i);
    expect(prisma.domainTagAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("allows a rename that only differs in case", async () => {
    // "electrical" -> "Electrical" collides with itself, and refusing your
    // own name would make fixing capitalisation impossible.
    const res = await PATCH(req(withDivisionName("ELECTRICAL")), ctx());
    expect(res.status).toBe(200);
    expect(prisma.domainDivision.update).toHaveBeenCalled();
  });

  it("ignores an empty name rather than blanking the division", async () => {
    const res = await PATCH(req(withDivisionName("   ")), ctx());
    expect(res.status).toBe(200);
    expect(prisma.domainDivision.update).not.toHaveBeenCalled();
  });
});
