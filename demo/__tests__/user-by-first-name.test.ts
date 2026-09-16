import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    projectMember: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { userByFirstName } from "@/lib/server-access";

// Two people called Sanjana: one rostered on project 86, one not.
const OTHER = { id: "u-other", name: "Sanjana Rao", isActive: true };
const ME = { id: "u-me", name: "Sanjana Joshi", isActive: true };
const INACTIVE = { id: "u-old", name: "Sanjana Old", isActive: false };

beforeEach(() => {
  vi.mocked(prisma.user.findMany).mockReset();
  vi.mocked(prisma.projectMember.findMany).mockReset();
  // The database returns the namesake first — the order that used to win.
  vi.mocked(prisma.user.findMany).mockResolvedValue([INACTIVE, OTHER, ME] as never);
  vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
    { userId: "u-me" },
  ] as never);
});

describe("userByFirstName with a shared first name", () => {
  it("prefers the signed-in user when their own name matches", async () => {
    const u = await userByFirstName("Sanjana", { projectId: 86, userId: "u-me" });
    expect(u?.id).toBe("u-me");
    // Self match needs no roster lookup.
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
  });

  it("prefers the namesake rostered on the project over one who is not", async () => {
    const u = await userByFirstName("Sanjana", { projectId: 86, userId: "u-lead" });
    expect(u?.id).toBe("u-me");
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith({
      where: { projectId: 86, userId: { in: ["u-old", "u-other", "u-me"] } },
      select: { userId: true },
    });
  });

  it("falls back to an active account when nobody matching is on the project", async () => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([] as never);
    const u = await userByFirstName("Sanjana", { projectId: 86 });
    expect(u?.id).toBe("u-other");
  });

  it("without a hint still skips inactive accounts", async () => {
    const u = await userByFirstName("sanjana");
    expect(u?.id).toBe("u-other");
  });

  it("matches on the first word only, case-insensitively", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u-sam", name: "Samuel Green", isActive: true },
      { id: "u-s", name: "Sam Blue", isActive: true },
    ] as never);
    const u = await userByFirstName("SAM");
    expect(u?.id).toBe("u-s");
  });

  it("returns null when nothing matches", async () => {
    expect(await userByFirstName("Nobody")).toBeNull();
    expect(await userByFirstName("  ")).toBeNull();
  });
});
