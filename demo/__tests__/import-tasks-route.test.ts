import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// The route reaches for prisma at module load — stub it so importing the
// handler doesn't spin up a real Prisma client. `project.findUnique` is only
// hit once we're past the permission gates, so a resolved stub is enough for
// the Admin/Coordinator happy path (which then 400s on the missing file).
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: vi.fn().mockResolvedValue({ name: "Acme" }) },
  },
}));

// Drive the gates directly: requireUser + canAccessProject are the only
// things between the request and the role check.
vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canAccessProject: vi.fn(),
  writeAudit: vi.fn(),
}));

// The route imports the tasks engine (which pulls server-access) — stub it so
// the module graph loads without a DB.
vi.mock("@/lib/import/tasks", () => ({
  parseTaskRows: vi.fn(),
  commitTaskRows: vi.fn(),
}));

import { requireUser, canAccessProject } from "@/lib/server-access";
import { POST } from "@/app/api/projects/[id]/import-tasks/route";
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

function ctx() {
  return { params: Promise.resolve({ id: "1" }) };
}

function uploadReq(): Request {
  // A multipart body with no `file` part — enough to get past formData()
  // parsing so we reach the file-presence check (a 400 that only fires once
  // the permission gates have passed).
  const fd = new FormData();
  fd.append("mode", "preview");
  return new Request("http://test/api/projects/1/import-tasks", {
    method: "POST",
    body: fd,
  });
}

describe("POST /api/projects/[id]/import-tasks permission gate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(canAccessProject).mockReset();
    vi.mocked(canAccessProject).mockResolvedValue(true);
  });

  it("passes through the 401 when there's no session", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(uploadReq(), ctx());
    expect(res.status).toBe(401);
  });

  for (const role of ["Developer", "Lead", "BusinessDeveloper"] as const) {
    it(`forbids a ${role} (403)`, async () => {
      vi.mocked(requireUser).mockResolvedValue(user(role));
      const res = await POST(uploadReq(), ctx());
      expect(res.status).toBe(403);
    });
  }

  it("forbids a Coordinator on a project they don't coordinate (403)", async () => {
    vi.mocked(requireUser).mockResolvedValue(user("Coordinator"));
    vi.mocked(canAccessProject).mockResolvedValue(false);
    const res = await POST(uploadReq(), ctx());
    expect(res.status).toBe(403);
  });

  it("lets a Coordinator through on a project they coordinate (400 — no file)", async () => {
    vi.mocked(requireUser).mockResolvedValue(user("Coordinator"));
    vi.mocked(canAccessProject).mockResolvedValue(true);
    const res = await POST(uploadReq(), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });

  it("lets an Admin through the gate (400 only because no file is attached)", async () => {
    vi.mocked(requireUser).mockResolvedValue(user("Admin"));
    const res = await POST(uploadReq(), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });
});
