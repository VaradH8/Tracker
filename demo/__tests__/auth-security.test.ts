import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

/**
 * E3: client IP comes from the right-most X-Forwarded-For hop, and the
 *     tracker login throttle counts failures only.
 * E4: the Session table stores sha256(token), never the cookie value, and
 *     a password change ends the account's other sessions.
 */

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/client-ip";
import { hashSessionToken } from "@/lib/session-token";
import { changePassword, getCurrentUser, signIn } from "@/lib/auth";
import { __resetRateLimits } from "@/lib/rate-limit";

const PASSWORD = "Correct-horse-1";
let passwordHash = "";

function account() {
  return {
    id: "u1",
    email: "dev@example.com",
    name: "Dev Person",
    primaryRole: "Developer",
    isAdmin: false,
    isActive: true,
    passwordHash,
  };
}

beforeEach(async () => {
  jar.clear();
  __resetRateLimits();
  passwordHash ||= await bcrypt.hash(PASSWORD, 4);
  vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValue(account() as never);
  vi.mocked(prisma.user.findMany).mockReset().mockResolvedValue([account()] as never);
  vi.mocked(prisma.user.update).mockReset().mockResolvedValue(account() as never);
  vi.mocked(prisma.session.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(prisma.session.deleteMany).mockReset().mockResolvedValue({ count: 0 } as never);
});

describe("clientIp (E3)", () => {
  const withXff = (xff: string) =>
    new Request("http://t", { headers: { "x-forwarded-for": xff } });

  it("takes the right-most hop — the one our proxy added", () => {
    expect(clientIp(withXff("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
  });

  it("ignores whatever the client wrote to the left", () => {
    const a = clientIp(withXff("1.1.1.1, 203.0.113.9"));
    const b = clientIp(withXff("2.2.2.2, 203.0.113.9"));
    expect(a).toBe(b);
  });

  it("falls back to X-Real-IP, then null", () => {
    expect(clientIp(new Request("http://t", { headers: { "x-real-ip": "10.0.0.4" } }))).toBe("10.0.0.4");
    expect(clientIp(new Request("http://t"))).toBeNull();
  });
});

describe("tracker login throttle (E3)", () => {
  it("does not lock the office out after many successful sign-ins from one IP", async () => {
    for (let i = 0; i < 30; i++) {
      const r = await signIn("dev@example.com", PASSWORD, "203.0.113.9");
      expect(r.ok).toBe(true);
    }
  });

  it("locks an account after repeated wrong passwords", async () => {
    for (let i = 0; i < 6; i++) {
      await signIn("dev@example.com", "wrong-password-1", "203.0.113.9");
    }
    const r = await signIn("dev@example.com", PASSWORD, "203.0.113.9");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Too many failed attempts/);
  });

  it("a successful sign-in clears the account's failure count", async () => {
    for (let i = 0; i < 4; i++) {
      await signIn("dev@example.com", "wrong-password-1", "203.0.113.9");
    }
    expect((await signIn("dev@example.com", PASSWORD, "203.0.113.9")).ok).toBe(true);
    for (let i = 0; i < 4; i++) {
      await signIn("dev@example.com", "wrong-password-1", "203.0.113.9");
    }
    expect((await signIn("dev@example.com", PASSWORD, "203.0.113.9")).ok).toBe(true);
  });
});

describe("session tokens (E4)", () => {
  it("stores only the hash of the cookie token", async () => {
    await signIn("dev@example.com", PASSWORD, null);
    const token = jar.get("tracker_session")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = vi.mocked(prisma.session.create).mock.calls[0][0].data as { id: string };
    expect(stored.id).toBe(hashSessionToken(token));
    expect(stored.id).not.toBe(token);
  });

  it("looks a session up by the hash of the cookie", async () => {
    jar.set("tracker_session", "raw-cookie-token");
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: hashSessionToken("raw-cookie-token"),
      expiresAt: new Date(Date.now() + 60_000),
      user: account(),
    } as never);
    const me = await getCurrentUser();
    expect(me?.id).toBe("u1");
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: hashSessionToken("raw-cookie-token") } }),
    );
  });

  it("hashes exactly like the migration, so existing sessions survive", () => {
    // Migration 20261116000000 rewrites ids with Postgres
    // encode(sha256(convert_to(id, 'UTF8')), 'hex'): lower-case hex SHA-256
    // of the UTF-8 bytes. The FIPS 180-2 test vector for "abc" pins that.
    expect(hashSessionToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("a password change ends every other session and issues a fresh one", async () => {
    jar.set("tracker_session", "old-token");
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: hashSessionToken("old-token"),
      expiresAt: new Date(Date.now() + 60_000),
      user: account(),
    } as never);
    const r = await changePassword(PASSWORD, "Brand-new-pass-2");
    expect(r.ok).toBe(true);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    expect(jar.get("tracker_session")).not.toBe("old-token");
  });
});
