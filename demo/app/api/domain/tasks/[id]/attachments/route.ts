import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_ROOT,
  formatBytes,
  isFileSide,
  kindFromName,
  safeFileName,
  storageKeyFor,
} from "@/lib/domain-task-files";

/**
 * Attach a file to a task — the brief when handing it over, or the work
 * when handing it back.
 *
 * Who may attach follows who may write to the task at that moment, which
 * is not the same as who may read it:
 *
 *   Brief       — whoever assigned it. It is their instruction.
 *   Submission  — whoever it is assigned to. It is their answer.
 *
 * A reviewer attaches neither. They are reading, and a file appearing from
 * a third party in the middle of a review has no obvious side to sit on.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const taskId = Number(idStr);
  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const task = await prisma.domainTask.findUnique({
    where: { id: taskId },
    select: { id: true, assigneeId: true, createdById: true, status: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Send the file as form data." }, { status: 400 });
  }

  const sideRaw = String(form.get("side") ?? "Brief");
  if (!isFileSide(sideRaw)) {
    return NextResponse.json({ error: "Unknown attachment side." }, { status: 400 });
  }

  const allowed =
    sideRaw === "Brief" ? task.createdById === user.id : task.assigneeId === user.id;
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          sideRaw === "Brief"
            ? "Only the person who assigned this task can attach to the brief."
            : "Only the person it is assigned to can attach their work.",
      },
      { status: 403 },
    );
  }

  /**
   * Nothing new once it has been signed off. The record of what was
   * reviewed has to stay what was reviewed — a file appearing afterwards
   * would sit under an approval that never saw it.
   */
  if (task.status === "Approved") {
    return NextResponse.json(
      { error: "This task is approved — its files are part of the record now." },
      { status: 409 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Pick a file." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${formatBytes(MAX_UPLOAD_BYTES)}.` },
      { status: 413 },
    );
  }

  const name = safeFileName(file.name);
  const storageKey = storageKeyFor(taskId, name);
  const absPath = join(UPLOAD_ROOT, storageKey);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, Buffer.from(await file.arrayBuffer()));

  const created = await prisma.domainTaskAttachment.create({
    data: {
      taskId,
      side: sideRaw,
      name,
      size: formatBytes(file.size),
      kind: kindFromName(name),
      uploadedById: user.id,
      storageKey,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json(
    {
      attachment: {
        id: created.id,
        side: created.side,
        name: created.name,
        size: created.size,
        kind: created.kind,
        uploadedBy: created.uploadedBy?.name ?? null,
        at: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
