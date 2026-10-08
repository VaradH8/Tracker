import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canDownloadPerformance,
  canEditPerformance,
  canRateHrEvaluation,
  canSeePerformance,
  canSeeReviewOf,
  isReportingManager,
  requireUser,
  writeAudit,
} from "@/lib/server-access";
import { REVIEWED_BY, isHrKey, parseReviewQuery, validateChanges } from "@/lib/performance/forms";
import { activeHrNames, findEmployee, loadReport, saveReviewChanges } from "@/lib/performance/load";
import type { SessionUser } from "@/lib/auth";

/** The HR name the Sign-Off shows: the HR account viewing it (the one
 *  whose name the download prints), otherwise the active HR accounts. */
async function hrSignOffName(me: SessionUser): Promise<string> {
  return canDownloadPerformance(me) ? me.name : activeHrNames();
}

/** GET ?userId&kind=Monthly|Yearly&period=YYYY-MM|YYYY — the generated
 *  review: the tracker's facts (tasks, hours, leave, KPIs) plus the
 *  ratings and remarks people have entered. */
export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeePerformance(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = parseReviewQuery(Object.fromEntries(new URL(req.url).searchParams));
  if (!q) return NextResponse.json({ error: "Invalid userId, kind or period" }, { status: 400 });

  const employee = await findEmployee(q.userId);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSeeReviewOf(me, employee)) {
    return NextResponse.json({ error: "A Lead sees only the reviews of their own team." }, { status: 403 });
  }

  const loaded = await loadReport(q.userId, q.kind, q.period);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...loaded,
    canEdit: canEditPerformance(me, employee),
    canEditHr: canRateHrEvaluation(me),
    canDownload: canDownloadPerformance(me),
    hrName: await hrSignOffName(me),
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
  if (!canSeePerformance(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = putBody.safeParse(await req.json().catch(() => null));
  const q = parsed.success ? parseReviewQuery(parsed.data) : null;
  if (!parsed.success || !q) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const employee = await findEmployee(q.userId);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSeeReviewOf(me, employee)) {
    return NextResponse.json({ error: "A Lead sees only the reviews of their own team." }, { status: 403 });
  }
  if (!canEditPerformance(me, employee)) {
    return NextResponse.json(
      { error: "Only this person's Reporting Manager, an Admin or HR can edit this review." },
      { status: 403 },
    );
  }

  if (!canRateHrEvaluation(me) && Object.keys(parsed.data.changes).some(isHrKey)) {
    return NextResponse.json({ error: "Only HR can fill in the HR Evaluation." }, { status: 403 });
  }

  const checked = validateChanges(parsed.data.changes);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  // The Admin or Lead who last saved the review is the Reporting Manager
  // named on the form. Server-set only — clients can't send this key.
  const changes = isReportingManager(me.role)
    ? { ...checked.changes, [REVIEWED_BY]: me.name }
    : checked.changes;
  const saved = await saveReviewChanges(q.userId, q.kind, q.period, changes, me.id);
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
    canEditHr: canRateHrEvaluation(me),
    canDownload: canDownloadPerformance(me),
    hrName: await hrSignOffName(me),
  });
}
