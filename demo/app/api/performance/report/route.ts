import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canDownloadPerformance,
  canEditPerformance,
  canSeePerformance,
  requireUser,
  writeAudit,
} from "@/lib/server-access";
import { parseReviewQuery, validateChanges } from "@/lib/performance/forms";
import { findEmployee, loadReport, saveReviewChanges } from "@/lib/performance/load";

/** GET ?userId&kind=Monthly|Yearly&period=YYYY-MM|YYYY — the generated
 *  review: tracker evidence + suggested ratings merged with what the
 *  reviewer saved. */
export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeePerformance(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = parseReviewQuery(Object.fromEntries(new URL(req.url).searchParams));
  if (!q) return NextResponse.json({ error: "Invalid userId, kind or period" }, { status: 400 });

  const employee = await findEmployee(q.userId);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const loaded = await loadReport(q.userId, q.kind, q.period);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...loaded,
    canEdit: canEditPerformance(me, employee),
    canDownload: canDownloadPerformance(me),
  });
}

const putBody = z.object({
  userId: z.string().min(1),
  kind: z.string(),
  period: z.string(),
  /** Only the fields that changed: field → new value, "" clears it. */
  changes: z.record(z.string(), z.string()),
});

/** PUT — save the reviewer's edits. Merged onto what's saved, so the
 *  employee's own entries from My Performance aren't overwritten by a
 *  reviewer whose page was opened earlier. */
export async function PUT(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeePerformance(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = putBody.safeParse(await req.json().catch(() => null));
  const q = parsed.success ? parseReviewQuery(parsed.data) : null;
  if (!parsed.success || !q) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const employee = await findEmployee(q.userId);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditPerformance(me, employee)) {
    return NextResponse.json(
      { error: "Only the Reporting Manager, HR or Admin can edit this review." },
      { status: 403 },
    );
  }

  const checked = validateChanges(parsed.data.changes);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const saved = await saveReviewChanges(q.userId, q.kind, q.period, checked.changes, me.id);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  await writeAudit(me.id, "performance.save", {
    scope: `${q.kind} review ${q.period}`,
    taskTitle: employee.name,
    before: `${Object.keys(saved.previous).length} field(s)`,
    after: `${Object.keys(saved.next).length} field(s)`,
  });

  const loaded = await loadReport(q.userId, q.kind, q.period);
  return NextResponse.json({
    ...loaded,
    canEdit: true,
    canDownload: canDownloadPerformance(me),
  });
}
