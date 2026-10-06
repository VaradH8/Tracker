import { NextResponse } from "next/server";
import { canDownloadPerformance, requireUser, writeAudit } from "@/lib/server-access";
import { parseReviewQuery } from "@/lib/performance/forms";
import { loadReport } from "@/lib/performance/load";
import { docxFileName, renderDocx } from "@/lib/performance/docx";

/** GET ?userId&kind&period — the review as the official IBS Word
 *  document. HR only: everyone else who can see the review reads it on
 *  screen at /performance. */
export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canDownloadPerformance(me)) {
    return NextResponse.json(
      { error: "Only HR can download performance reports." },
      { status: 403 },
    );
  }
  const q = parseReviewQuery(Object.fromEntries(new URL(req.url).searchParams));
  if (!q) return NextResponse.json({ error: "Invalid userId, kind or period" }, { status: 400 });

  const loaded = await loadReport(q.userId, q.kind, q.period);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = await renderDocx(loaded.report, { hrName: me.name });
  await writeAudit(me.id, "performance.download", {
    scope: `${q.kind} review ${q.period}`,
    taskTitle: loaded.report.employee.name,
  });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${docxFileName(loaded.report)}"`,
      "Cache-Control": "no-store",
    },
  });
}
