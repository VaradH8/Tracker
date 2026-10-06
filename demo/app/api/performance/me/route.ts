import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canSelfReview, notifyUser, requireUser, writeAudit } from "@/lib/server-access";
import {
  isCommentRecipient,
  isEmployeeKey,
  parseReviewQuery,
  validateChanges,
  type CommentRecipient,
} from "@/lib/performance/forms";
import { findEmployee, loadReport, saveReviewChanges } from "@/lib/performance/load";
import { periodLabel, toSelfView, type Inputs } from "@/lib/performance/report";

/** GET ?kind=Monthly|Yearly&period=YYYY-MM|YYYY — the signed-in
 *  employee's own review, as they see it (no manager ratings, comments or
 *  suggested scores — see toSelfView). */
export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSelfReview(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  // Always the caller — any userId in the query is ignored.
  const q = parseReviewQuery({ userId: me.id, kind: sp.get("kind"), period: sp.get("period") });
  if (!q) return NextResponse.json({ error: "Invalid kind or period" }, { status: 400 });

  const loaded = await loadReport(q.userId, q.kind, q.period);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ view: toSelfView(loaded.report), savedAt: loaded.meta.savedAt });
}

const putBody = z.object({
  kind: z.string(),
  period: z.string(),
  /** Only the fields that changed: field → new value, "" clears it. */
  changes: z.record(z.string(), z.string()),
});

type Recipient = { id: string; name: string };

/** The people a comment addressed to `to` reaches: the employee's
 *  Reporting Manager, or every active HR account. Never the sender. */
async function recipientsFor(
  to: CommentRecipient,
  employeeId: string,
): Promise<Recipient[]> {
  if (to === "manager") {
    const employee = await findEmployee(employeeId);
    if (!employee?.reportingManagerId) return [];
    const manager = await prisma.user.findUnique({
      where: { id: employee.reportingManagerId },
      select: { id: true, name: true, isActive: true },
    });
    return manager?.isActive && manager.id !== employeeId ? [{ id: manager.id, name: manager.name }] : [];
  }
  const hr = await prisma.user.findMany({
    where: { primaryRole: "HR", isActive: true, NOT: { id: employeeId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return hr;
}

/** A comment is "submitted" when this save leaves a comment in place and
 *  either its text or who it's addressed to changed. */
function submittedComment(previous: Inputs, next: Inputs): { text: string; to: CommentRecipient | "" } | null {
  const text = next["summary.employeeComments"] ?? "";
  const to = isCommentRecipient(next["summary.commentTo"]) ? next["summary.commentTo"] : "";
  if (!text) return null;
  const changed =
    text !== (previous["summary.employeeComments"] ?? "") ||
    to !== (previous["summary.commentTo"] ?? "");
  return changed ? { text, to } : null;
}

/** PUT — save the employee's own fields: self-ratings, self-assessment,
 *  achievement summary, comments and who the comments go to. Submitting
 *  a comment notifies the chosen Reporting Manager or HR. */
export async function PUT(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSelfReview(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = putBody.safeParse(await req.json().catch(() => null));
  const q = parsed.success
    ? parseReviewQuery({ userId: me.id, kind: parsed.data.kind, period: parsed.data.period })
    : null;
  if (!parsed.success || !q) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const checked = validateChanges(parsed.data.changes, isEmployeeKey);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  // Resolved inside the save so a comment without anyone to receive it
  // is refused before anything is written.
  let recipients: Recipient[] = [];
  let comment: { text: string; to: CommentRecipient | "" } | null = null;
  const saved = await saveReviewChanges(me.id, q.kind, q.period, checked.changes, me.id, async (previous, next) => {
    comment = submittedComment(previous, next);
    if (!comment) return null;
    if (!comment.to) return "Choose who your comment is for: Reporting Manager or HR.";
    recipients = await recipientsFor(comment.to, me.id);
    if (recipients.length) return null;
    return comment.to === "manager"
      ? "You don't have a Reporting Manager yet — send it to HR, or ask HR to set your Reporting Manager."
      : "There's no HR account to send this to yet — send it to your Reporting Manager.";
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });

  const sent = comment as { text: string; to: CommentRecipient | "" } | null;
  if (sent) {
    const label = `${q.kind.toLowerCase()} review for ${periodLabel(q.kind, q.period)}`;
    const preview = sent.text.length > 500 ? sent.text.slice(0, 497) + "…" : sent.text;
    const baseUrl = new URL(req.url).origin;
    for (const r of recipients) {
      await notifyUser(r.id, {
        kind: "performance_comment",
        title: `${me.name} commented on their ${label}`,
        body: preview,
        actorName: me.name,
        baseUrl,
      });
    }
  }

  await writeAudit(me.id, "performance.self_save", {
    scope: `${q.kind} review ${q.period}`,
    taskTitle: me.name,
    before: `${Object.keys(saved.previous).length} field(s)`,
    after: sent
      ? `${Object.keys(saved.next).length} field(s); comment sent to ${recipients.map((r) => r.name).join(", ")}`
      : `${Object.keys(saved.next).length} field(s)`,
  });

  const loaded = await loadReport(me.id, q.kind, q.period);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    view: toSelfView(loaded.report),
    savedAt: loaded.meta.savedAt,
    notified: sent ? recipients.map((r) => r.name) : [],
  });
}
