import { NextResponse } from "next/server";
import { unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  isTaskAssignee,
  requireUser,
} from "@/lib/server-access";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/uploads";

/** GET — download the file. Stream the bytes from disk with the
 *  Content-Disposition set so the browser shows a Save dialog.
 *  Permission: anyone with access to the project can download. */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; attId: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr, attId: attIdStr } = await context.params;
  const taskId = Number(idStr);
  const attId = Number(attIdStr);
  if (!Number.isFinite(taskId) || !Number.isFinite(attId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const att = await prisma.taskAttachment.findUnique({
    where: { id: attId },
    select: { taskId: true, name: true, storageKey: true, kind: true },
  });
  if (!att || att.taskId !== taskId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task || !(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!att.storageKey) {
    return NextResponse.json(
      {
        error:
          "This attachment is metadata-only (uploaded before the storage backend was wired up).",
      },
      { status: 410 },
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(join(UPLOAD_DIR, att.storageKey));
  } catch {
    return NextResponse.json(
      { error: "File missing on disk." },
      { status: 404 },
    );
  }
  const contentType =
    att.kind === "pdf"
      ? "application/pdf"
      : att.kind === "image"
        ? "image/*"
        : "application/octet-stream";
  // The Buffer is fine to pass; Next will set Content-Length itself.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${att.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; attId: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr, attId: attIdStr } = await context.params;
  const taskId = Number(idStr);
  const attId = Number(attIdStr);
  if (!Number.isFinite(taskId) || !Number.isFinite(attId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const editor = canEditTasks(user.role);
  const assignee = await isTaskAssignee(user.id, taskId);
  if (!editor && !assignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const att = await prisma.taskAttachment.findUnique({
    where: { id: attId },
    select: { storageKey: true },
  });
  await prisma.taskAttachment.delete({ where: { id: attId } });
  if (att?.storageKey) {
    // Best-effort cleanup. If the file is already gone (e.g. an admin
    // wiped /uploads to reclaim space) we don't want to fail the API.
    await unlink(join(UPLOAD_DIR, att.storageKey)).catch(() => null);
  }
  return NextResponse.json({ ok: true });
}
