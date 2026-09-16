import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    projectMember: { findMany: vi.fn() },
    taskAssignee: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
  },
}));

// server-access pulls auth.ts, which reaches for next/headers.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => null,
    delete: () => null,
  }),
}));

import { prisma } from "@/lib/db";
import { askVocabulary } from "@/lib/ask/answer";
import type { SessionUser } from "@/lib/auth";

function actor(role: SessionUser["role"]): SessionUser {
  return {
    id: "u-me",
    email: "me@example.com",
    name: "Manasi Kulkarni",
    role,
    isAdmin: role === "Admin",
  };
}

beforeEach(() => {
  vi.mocked(prisma.projectMember.findMany).mockReset();
  vi.mocked(prisma.taskAssignee.findMany).mockReset();
  vi.mocked(prisma.user.findMany).mockReset().mockResolvedValue([] as never);
  vi.mocked(prisma.project.findMany).mockReset().mockResolvedValue([] as never);
});

/**
 * The vocabulary is the parser's entire universe of names. If it can't
 * contain someone, no question can name them — which is what stops
 * "what are <someone else's> tasks today" from reaching across teams.
 */
describe("askVocabulary scoping", () => {
  it("limits a Coordinator to their own projects and the people on them", async () => {
    vi.mocked(prisma.projectMember.findMany).mockImplementation((async (
      args: { where?: { userId?: string } },
    ) =>
      // First call: which projects do I coordinate? Second: who else is on them?
      args?.where?.userId
        ? [{ projectId: 7 }]
        : [{ userId: "u-varad" }]) as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([
      { userId: "u-asha" },
    ] as never);

    await askVocabulary(actor("Coordinator"));

    const userWhere = vi.mocked(prisma.user.findMany).mock.calls[0][0]?.where as {
      isActive: boolean;
      id: { in: string[] };
    };
    expect(userWhere.isActive).toBe(true);
    // Me, the project's other member, and the person holding a task on it —
    // and nobody else in the org.
    expect([...userWhere.id.in].sort()).toEqual(["u-asha", "u-me", "u-varad"]);

    const projectWhere = vi.mocked(prisma.project.findMany).mock.calls[0][0]
      ?.where;
    expect(projectWhere).toEqual({ id: { in: [7] } });
  });

  it("gives an Admin the whole org, unfiltered", async () => {
    await askVocabulary(actor("Admin"));

    // Admin short-circuits to "all", so no membership lookup is needed.
    expect(vi.mocked(prisma.projectMember.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]?.where).toEqual({
      isActive: true,
    });
    expect(vi.mocked(prisma.project.findMany).mock.calls[0][0]?.where).toEqual(
      {},
    );
  });

  it("gives a Lead the projects they are rostered on, not every project", async () => {
    vi.mocked(prisma.projectMember.findMany).mockImplementation((async (
      args: { where?: { userId?: string } },
    ) =>
      args?.where?.userId ? [{ projectId: 3 }] : [{ userId: "u-dev" }]) as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([] as never);

    await askVocabulary(actor("Lead"));

    expect(vi.mocked(prisma.project.findMany).mock.calls[0][0]?.where).toEqual({
      id: { in: [3] },
    });
  });

  it("leaves a user with no projects an empty vocabulary", async () => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([] as never);

    const vocab = await askVocabulary(actor("Coordinator"));

    expect(vi.mocked(prisma.project.findMany).mock.calls[0][0]?.where).toEqual({
      id: { in: [] },
    });
    expect(vocab.people).toEqual([]);
    expect(vocab.projects).toEqual([]);
    // They can still ask about themselves.
    expect(vocab.me.id).toBe("u-me");
  });
});
