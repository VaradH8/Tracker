import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { Role } from "@/lib/role";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findUnique: vi.fn() },
    taskAttachment: { create: vi.fn() },
  },
}));

// No real disk writes in tests.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canAccessProject: vi.fn(),
}));

import { requireUser, canAccessProject } from "@/lib/server-access";
import { prisma } from "@/lib/db";
import { POST as attachmentPOST } from "@/app/api/tasks/[id]/attachments/route";

function actor(role: Role) {
  return { id: `u-${role}`, email: `${role}@x.com`, name: `${role} User`, role };
}

function uploadReq() {
  const form = new FormData();
  form.append("file", new File(["hello"], "spec.pdf"));
  return new Request("http://test/api/tasks/1/attachments", {
    method: "POST",
    body: form,
  });
}

const params = { params: Promise.resolve({ id: "1" }) };

describe("attachment upload permissions", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(canAccessProject).mockReset();
    vi.mocked(prisma.task.findUnique).mockResolvedValue({
      projectId: 7,
    } as never);
    vi.mocked(prisma.taskAttachment.create).mockResolvedValue({
      id: 1,
      name: "spec.pdf",
      size: "5 B",
      kind: "pdf",
      uploadedBy: { name: "Dev User" },
      createdAt: new Date(),
    } as never);
  });

  it("401 when no session", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await attachmentPOST(uploadReq(), params)).status).toBe(401);
  });

  it("403 without project access", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    vi.mocked(canAccessProject).mockResolvedValue(false);
    expect((await attachmentPOST(uploadReq(), params)).status).toBe(403);
  });

  it("201 for a Developer who is not an assignee", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    vi.mocked(canAccessProject).mockResolvedValue(true);
    expect((await attachmentPOST(uploadReq(), params)).status).toBe(201);
  });

  it("201 for a Business Developer who is not an assignee", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      actor("BusinessDeveloper") as never,
    );
    vi.mocked(canAccessProject).mockResolvedValue(true);
    expect((await attachmentPOST(uploadReq(), params)).status).toBe(201);
  });
});
