import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { requireUser, writeAudit } from "@/lib/server-access";
import {
  parseSheets,
  commitParsed,
  serviceAreaForSheet,
  type SheetInput,
} from "@/lib/import/historical";

// The workbook is small (tens of KB), but cap uploads so a bad file can't
// exhaust memory.
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST multipart/form-data:
 *   file = the .xlsx workbook (Ongoing_Projects.xlsx shape)
 *   mode = "preview" (default, reads only) | "commit" (writes)
 *
 * Preview returns the real created-vs-reused counts and the list of
 * unmatched names without touching the DB. Commit applies the import
 * (idempotent) and writes an audit entry. Admin only.
 */
export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  if (user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const mode = String(form.get("mode") ?? "preview") === "commit" ? "commit" : "preview";

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
      { error: "Couldn't read that file — is it a valid .xlsx workbook?" },
      { status: 400 },
    );
  }

  // Map each sheet to its service area; sheets we don't recognise (e.g.
  // the dashboard tab) are reported as skipped rather than failing.
  const sheets: SheetInput[] = [];
  const importedSheets: string[] = [];
  const skippedSheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const serviceArea = serviceAreaForSheet(name);
    if (!serviceArea) {
      skippedSheets.push(name);
      continue;
    }
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as string[][];
    sheets.push({ serviceArea, rows });
    importedSheets.push(name);
  }

  if (sheets.length === 0) {
    return NextResponse.json(
      {
        error:
          "No recognisable project sheets in that workbook. Expected tabs like AMC, POCs, Thermax P&ID, Samanvay - Engg Memory.",
      },
      { status: 400 },
    );
  }

  const parsed = parseSheets(sheets);
  const { stats, unknownPeopleKeys } = await commitParsed(prisma, parsed, {
    dryRun: mode === "preview",
  });

  if (mode === "commit") {
    await writeAudit(user.id, "import.workbook", {
      scope: "Ongoing_Projects.xlsx",
      after: `${stats.tasksCreated + stats.tasksUpdated} tasks across ${stats.projectsCreated + stats.projectsReused} projects`,
    });
  }

  return NextResponse.json({
    mode,
    sheets: { imported: importedSheets, skipped: skippedSheets },
    perSheet: parsed.perSheet,
    counts: stats,
    rawTaskCount: parsed.rawTaskCount,
    uniqueTaskCount: parsed.tasks.length,
    unmatchedNames: parsed.unmatchedNames,
    unknownPeopleKeys,
  });
}