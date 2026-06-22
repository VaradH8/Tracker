import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// The route reaches for prisma at module load — stub it so importing the
// handler doesn't spin up a real Prisma client.
vi.mock("@/lib/db", () => ({ prisma: {} }));

// Drive the auth gate directly: requireUser is the only thing standing
// between the request and the role check.
vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  writeAudit: vi.fn(),
}));

import { requireUser } from "@/lib/server-access";
import { POST } from "@/app/api/import/route";
import type { SessionUser } from "@/lib/auth";

function user(role: SessionUser["role"]): SessionUser {
  return {
    id: `u-${role}`,
    email: `${role}@example.com`,
    name: `Test ${role}`,
    role,
    isAdmin: role === "Admin",
  };
}

function uploadReq(): Request {
  // A multipart body with no `file` part — enough to get past formData()
  // parsing so we reach the file-presence check.
  const fd = new FormData();
  fd.append("mode", "preview");
  return new Request("http://test/api/import", { method: "POST", body: fd });
}

describe("POST /api/import permission gate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
  });

  it("passes through the 401 when there's no session", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(uploadReq());
    expect(res.status).toBe(401);
  });

  it("forbids a Developer (403)", async () => {
    vi.mocked(requireUser).mockResolvedValue(user("Developer"));
    const res = await POST(uploadReq());
    expect(res.status).toBe(403);
  });

  it("forbids a Coordinator (403)", async () => {
    vi.mocked(requireUser).mockResolvedValue(user("Coordinator"));
    const res = await POST(uploadReq());
    expect(res.status).toBe(403);
  });

  it("forbids a Business Developer (403)", async () => {
    vi.mocked(requireUser).mockResolvedValue(user("BusinessDeveloper"));
    const res = await POST(uploadReq());
    expect(res.status).toBe(403);
  });

  it("lets an Admin through the gate (400 only because no file is attached)", async () => {
    vi.mocked(requireUser).mockResolvedValue(user("Admin"));
    const res = await POST(uploadReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });
});