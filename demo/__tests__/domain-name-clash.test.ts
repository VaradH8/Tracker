import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Display names have to be unique in the Domain module. Two accounts
 * reading "New Person" made every people-picker ambiguous — work was
 * assigned to one and its status read off the other — so creation is
 * blocked rather than merely disambiguated after the fact.
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    domainUser: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { nameClash } from "@/lib/domain-auth";

const PEOPLE = [
  { id: "u1", name: "New Person", email: "np1@example.com" },
  { id: "u2", name: "Mukesh Rane", email: "mukesh@example.com" },
];

describe("duplicate display names", () => {
  beforeEach(() => {
    vi.mocked(prisma.domainUser.findMany).mockResolvedValue(PEOPLE as never);
  });

  it("finds an exact match", async () => {
    const clash = await nameClash("New Person");
    expect(clash?.email).toBe("np1@example.com");
  });

  it("ignores case and surrounding whitespace", async () => {
    // "new person" and "New Person  " are the same person to a reader, so
    // they have to be the same person to the check.
    expect(await nameClash("  new PERSON ")).not.toBeNull();
    expect(await nameClash("MUKESH rane")).not.toBeNull();
  });

  it("allows a genuinely different name", async () => {
    expect(await nameClash("Sneha Kulkarni")).toBeNull();
  });

  it("treats an empty name as no clash — that is the required-field check", async () => {
    expect(await nameClash("   ")).toBeNull();
  });

  it("excludes the person being edited, so saving their own name is fine", async () => {
    expect(await nameClash("New Person", "u1")).toBeNull();
    // ...but another record holding that name still clashes.
    expect(await nameClash("New Person", "u2")).not.toBeNull();
  });
});
