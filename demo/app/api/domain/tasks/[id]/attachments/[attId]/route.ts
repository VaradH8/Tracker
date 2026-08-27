import { NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import { UPLOAD_ROOT } from "@/lib/domain-task-files";

/**
 * Download or remove one file on a task.
 *
 * Reading is wider than writing: whoever assigned it, whoever it is
 * assigned to, and anyone asked to review it all need to open both the
 * brief and the answer. A reviewer who cannot read the submission cannot
 * review it.
 *
 * Everyone else is refused, including supervisors with no connection to
 * the task. A file on somebody's task is not a company noticeboard, and
 * "manager" is not a reason to read one.
 */
async function reachable(taskId: number, userId: string) {
  const task = await prisma.domainTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      assigneeId: true,
      createdById: true,
      reviewers: { select: { userId: true } },
    },
  });
  if (!task) return null;
  const allowed =
    task.assigneeId === userId ||
    task.createdById === userId ||
    task.reviewers.some((r) => r.userId === userId);
  return { task, allowed };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; attId: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr, attId: attStr } = await context.params;
  const taskId = Number(idStr);
  const attId = Number(attStr);
  if (!Number.isInteger(taskId) || !Number.isInteger(attId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const reach = await reachable(taskId, user.id);
  if (!reach) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!reach.allowed) {
    return NextResponse.json(
      { error: "That file belongs to a task you're not on." },
      { status: 403 },
    );
  }

  const att = await prisma.domainTaskAttachment.findUnique({
    where: { id: attId },
    select: { taskId: true, name: true, storageKey: true },
  });
  // Checked rather than trusted: an id from the URL naming a file on a
  // different task would otherwise be served on this task's permission.
  if (!att || att.taskId !== taskId || !att.storageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(join(UPLOAD_ROOT, att.storageKey));
  } catch {
    // The row survived but the file did not — a restore that missed the
    // volume, most likely. Say so rather than returning a broken download.
    return NextResponse.json(
      { error: "That file is missing from storage." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      // `attachment` so a stray .html or .svg is saved rather than run in
      // the app's own origin.
      "Content-Disposition": `attachment; filename="${att.name.replace(/"/g, "")}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}

/**
 * Remove a file. Whoever put it there, while the task is still open.
 *
 * The disk copy goes with the row; a file nobody can reach is just a byte
 * bill. A failure to unlink is not fatal — losing the row is what matters,
 * and an orphan on disk is harmless.
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; attId: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr, attId: attStr } = await context.params;
  const taskId = Number(idStr);
  const attId = Number(attStr);
  if (!Number.isInteger(taskId) || !Number.isInteger(attId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const att = await prisma.domainTaskAttachment.findUnique({
    where: { id: attId },
    select: {
      taskId: true,
      storageKey: true,
      uploadedById: true,
      task: { select: { status: true } },
    },
  });
  if (!att || att.taskId !== taskId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (att.uploadedById !== user.id) {
    return NextResponse.json(
      { error: "Only whoever attached it can remove it." },
      { status: 403 },
    );
  }
  if (att.task.status === "Approved") {
    return NextResponse.json(
      { error: "This task is approved — its files are part of the record now." },
      { status: 409 },
    );
  }

  await prisma.domainTaskAttachment.delete({ where: { id: attId } });
  if (att.storageKey) {
    await unlink(join(UPLOAD_ROOT, att.storageKey)).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
