import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { Role } from "@/lib/role";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findUnique: vi.fn() },
    taskAttachment: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}));

// No real disk access in tests.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("hello")),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canAccessProject: vi.fn(),
  canUseTaskFiles: vi.fn(),
  canEditTasks: vi.fn(),
  isTaskAssignee: vi.fn(),
}));

import {
  requireUser,
  canAccessProject,
  canUseTaskFiles,
  canEditTasks,
  isTaskAssignee,
} from "@/lib/server-access";
import { prisma } from "@/lib/db";
import { POST as attachmentPOST } from "@/app/api/tasks/[id]/attachments/route";
import {
  GET as attachmentGET,
  DELETE as attachmentDELETE,
} from "@/app/api/tasks/[id]/attachments/[attId]/route";

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
const attParams = (attId: string) => ({
  params: Promise.resolve({ id: "1", attId }),
});
const req = (method: string) =>
  new Request("http://test/api/tasks/1/attachments/9", { method });

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(canAccessProject).mockReset();
  vi.mocked(canUseTaskFiles).mockReset();
  vi.mocked(canEditTasks).mockReset();
  vi.mocked(isTaskAssignee).mockReset();
  vi.mocked(prisma.taskAttachment.delete).mockReset();
  vi.mocked(prisma.taskAttachment.create).mockReset();
  vi.mocked(prisma.task.findUnique).mockResolvedValue({
    id: 1,
    projectId: 7,
    responsibleId: null,
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

describe("attachment upload permissions", () => {
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

  it("201 for a Developer on the project who is not an assignee", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    vi.mocked(canAccessProject).mockResolvedValue(true);
    vi.mocked(canUseTaskFiles).mockResolvedValue(true);
    expect((await attachmentPOST(uploadReq(), params)).status).toBe(201);
  });

  it("201 for a Business Developer on the project who is not an assignee", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      actor("BusinessDeveloper") as never,
    );
    vi.mocked(canAccessProject).mockResolvedValue(true);
    vi.mocked(canUseTaskFiles).mockResolvedValue(true);
    expect((await attachmentPOST(uploadReq(), params)).status).toBe(201);
  });

  it("403 when the project is reachable but the task is neither visible nor on their roster (E5)", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    vi.mocked(canAccessProject).mockResolvedValue(true);
    vi.mocked(canUseTaskFiles).mockResolvedValue(false);
    expect((await attachmentPOST(uploadReq(), params)).status).toBe(403);
    expect(prisma.taskAttachment.create).not.toHaveBeenCalled();
  });
});

describe("attachment download permissions (E5)", () => {
  beforeEach(() => {
    vi.mocked(prisma.taskAttachment.findUnique).mockResolvedValue({
      taskId: 1,
      name: "spec.pdf",
      storageKey: "1/abc.pdf",
      kind: "pdf",
    } as never);
  });

  it("200 for someone who may use the task's files", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    vi.mocked(canAccessProject).mockResolvedValue(true);
    vi.mocked(canUseTaskFiles).mockResolvedValue(true);
    expect((await attachmentGET(req("GET"), attParams("9"))).status).toBe(200);
  });

  it("403 with project access but no right to this task's files", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    vi.mocked(canAccessProject).mockResolvedValue(true);
    vi.mocked(canUseTaskFiles).mockResolvedValue(false);
    expect((await attachmentGET(req("GET"), attParams("9"))).status).toBe(403);
  });
});

describe("attachment delete (E1)", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    vi.mocked(canAccessProject).mockResolvedValue(true);
    vi.mocked(canEditTasks).mockReturnValue(false);
    vi.mocked(isTaskAssignee).mockResolvedValue(true);
  });

  it("deletes an attachment that belongs to the task", async () => {
    vi.mocked(prisma.taskAttachment.findUnique).mockResolvedValue({
      taskId: 1,
      storageKey: "1/abc.pdf",
    } as never);
    const res = await attachmentDELETE(req("DELETE"), attParams("9"));
    expect(res.status).toBe(200);
    expect(prisma.taskAttachment.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it("404s, and deletes nothing, when the attachment belongs to another task", async () => {
    // Assignee of task 1, asking to delete attachment 9 — which is on task 42.
    vi.mocked(prisma.taskAttachment.findUnique).mockResolvedValue({
      taskId: 42,
      storageKey: "42/secret.pdf",
    } as never);
    const res = await attachmentDELETE(req("DELETE"), attParams("9"));
    expect(res.status).toBe(404);
    expect(prisma.taskAttachment.delete).not.toHaveBeenCalled();
  });

  it("403 for someone who is neither an editor nor an assignee", async () => {
    vi.mocked(isTaskAssignee).mockResolvedValue(false);
    const res = await attachmentDELETE(req("DELETE"), attParams("9"));
    expect(res.status).toBe(403);
    expect(prisma.taskAttachment.delete).not.toHaveBeenCalled();
  });
});
