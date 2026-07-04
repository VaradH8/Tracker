import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { canAccessProject, requireUser, writeAudit } from "@/lib/server-access";
import { commitTaskRows, parseTaskRows, type ParsedTaskRow } from "@/lib/import/tasks";

// A tasks sheet is tiny, but cap the upload so a bad file can't exhaust
// memory.
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST multipart/form-data — import tasks into ONE project.
 *   file = an .xlsx / .xls / .csv table of task rows (needs at least a
 *          Task / Title / Description column; Priority, Status, Start
 *          date, Target date, Effort, Assignees, Responsible, Remark are
 *          all optional and matched by header name).
 *   mode = "preview" (default, reads only) | "commit" (writes)
 *
 * Access: Admin (any project) or Coordinator (only projects they
 * coordinate — enforced by canAccessProject). Everyone else gets 403.
 * Idempotent: re-running updates existing tasks by title instead of
 * duplicating. Only Tasks are created — never projects, clients or users.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  // The button is Admin/Coordinator only; enforce it server-side too.
  if (user.role !== "Admin" && user.role !== "Coordinator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await context.params;
  const projectId = Number(idStr);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
  }

  // Admin sees every project; a Coordinator only the ones they coordinate.
  // This keeps one coordinator from importing into another's project.
  if (!(await canAccessProject(user, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const mode =
    String(form.get("mode") ?? "preview") === "commit" ? "commit" : "preview";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 25 MB)." },
      { status: 400 },
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file — is it a valid .xlsx or .csv?" },
      { status: 400 },
    );
  }

  // Parse every sheet; a task table can live on any tab. Rows from all
  // sheets are pooled, then deduped by title.
  const pooled: ParsedTaskRow[] = [];
  let rawRowCount = 0;
  let anyHeader = false;
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as string[][];
    const res = parseTaskRows(rows);
    if (res.headerFound) anyHeader = true;
    rawRowCount += res.rawRowCount;
    pooled.push(...res.tasks);
  }

  if (!anyHeader) {
    return NextResponse.json(
      {
        error:
          "Couldn't find a task table. The first row should have a header like: Task, Priority, Status, Start date, Target date, Effort, Assignees, Remark.",
      },
      { status: 400 },
    );
  }

  const byTitle = new Map<string, ParsedTaskRow>();
  for (const t of pooled) {
    byTitle.set(t.title.toLowerCase().replace(/\s+/g, " ").trim(), t);
  }
  const tasks = Array.from(byTitle.values());

  if (tasks.length === 0) {
    return NextResponse.json(
      { error: "The file has a header but no task rows." },
      { status: 400 },
    );
  }

  const { stats, unmatchedNames } = await commitTaskRows(
    prisma,
    projectId,
    tasks,
    { dryRun: mode === "preview", actorId: user.id },
  );

  if (mode === "commit") {
    await writeAudit(user.id, "task.import", {
      scope: project.name,
      after: `${stats.tasksCreated + stats.tasksUpdated} tasks (${stats.tasksCreated} new, ${stats.tasksUpdated} updated)`,
    });
  }

  return NextResponse.json({
    mode,
    rawRowCount,
    uniqueTaskCount: tasks.length,
    counts: stats,
    unmatchedNames,
  });
}
