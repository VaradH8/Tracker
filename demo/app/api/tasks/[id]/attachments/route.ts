import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  isTaskAssignee,
  requireUser,
} from "@/lib/server-access";
import { serializeAttachment } from "@/lib/serializers";

/** Max bytes accepted per uploaded file. Anything larger gets rejected
 *  with 413. 25 MB is generous for typical task attachments
 *  (PDFs, screenshots, spreadsheets) without inviting "let me upload
 *  a 4 GB video clip". */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Where on disk the files live. Bind-mounted from ./uploads on the
 *  host (see compose.yml), so attachments survive container rebuilds
 *  and can be backed up alongside Postgres. */
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/uploads";

function kindFromName(name: string): "pdf" | "image" | "doc" | "sheet" | "other" {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["doc", "docx", "odt", "rtf", "txt", "md"].includes(ext)) return "doc";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "sheet";
  return "other";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const taskId = Number(idStr);
  if (!Number.isFinite(taskId)) {
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

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a `file` field." },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Pick a file to upload." },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${formatBytes(MAX_UPLOAD_BYTES)}.` },
      { status: 413 },
    );
  }

  const safeName = file.name.replace(/[/\\]/g, "_").slice(0, 200);
  // Per-task subfolder + random prefix on the stored filename keeps
  // listings tidy and prevents two attachments with the same human
  // name from clobbering each other on disk.
  const subdir = join(UPLOAD_DIR, String(taskId));
  await mkdir(subdir, { recursive: true });
  const storedName = `${randomBytes(8).toString("hex")}${extname(safeName) || ""}`;
  const absPath = join(subdir, storedName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(absPath, bytes);
  // Relative path from UPLOAD_DIR root — what we store in the DB.
  const storageKey = `${taskId}/${storedName}`;

  const created = await prisma.taskAttachment.create({
    data: {
      taskId,
      name: safeName,
      size: formatBytes(file.size),
      kind: kindFromName(safeName),
      uploadedById: user.id,
      storageKey,
    },
    include: { uploadedBy: true },
  });
  return NextResponse.json(
    { attachment: serializeAttachment(created) },
    { status: 201 },
  );
}
