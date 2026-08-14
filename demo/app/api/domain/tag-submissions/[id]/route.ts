import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { SUPERVISOR_ROLES } from "@/lib/domain";
import { toISODate } from "@/lib/forecast";
import { sendEmail } from "@/lib/mailer";

/**
 * Tell the actionee what a Lead decided about their submission. The
 * EmailLog row is the record that we notified; the actual send is
 * best-effort and no-ops when SMTP isn't configured, so review never
 * fails because of mail. The note is also shown in-app on My tags, which
 * is where most people will actually read it.
 */
async function notifyActionee(opts: {
  toEmail: string;
  actioneeName: string;
  projectName: string;
  divisionName: string | null;
  date: string;
  submitted: number;
  approved: number;
  outcome: "Approved" | "Rejected";
  reviewerName: string;
  reviewNote: string | null;
}): Promise<void> {
  const where = `${opts.projectName}${opts.divisionName ? ` · ${opts.divisionName}` : ""}`;
  const headline =
    opts.outcome === "Rejected"
      ? `${opts.reviewerName} did not approve your ${opts.submitted} tag(s) on ${where}.`
      : opts.approved === opts.submitted
        ? `${opts.reviewerName} approved all ${opts.submitted} tag(s) on ${where}.`
        : `${opts.reviewerName} approved ${opts.approved} of the ${opts.submitted} tag(s) you submitted on ${where}.`;

  const body = [
    `Hi ${opts.actioneeName},`,
    "",
    headline,
    `Work date: ${opts.date}`,
    opts.reviewNote ? `Note from your Lead: ${opts.reviewNote}` : null,
    "",
    "Open the Domain module to see your current tag position.",
  ]
    .filter(Boolean)
    .join("\n");

  const subject =
    opts.outcome === "Rejected"
      ? `Tag submission not approved — ${where}`
      : `Tag submission approved (${opts.approved}) — ${where}`;

  // recipientId stays null: EmailLog links to the tracker's User table and
  // this recipient is a DomainUser, a deliberately separate identity.
  await prisma.emailLog.create({
    data: {
      recipientId: null,
      toEmail: opts.toEmail,
      subject,
      body,
      kind: "domain_tag_review",
    },
  });
  await sendEmail({ to: opts.toEmail, subject, body });
}

/**
 * Lead review of a claimed tag count — the hinge the whole feature turns
 * on. Approving is the ONLY thing that moves `deliveredCount`, and it does
 * so in the same transaction as the status change so the two can never
 * drift apart. Everything downstream (project delivered totals, per-person
 * rates, projected delivery dates) is derived from those numbers, so the
 * forecast updates itself the moment a Lead approves.
 *
 * Approvers are Admins, Leads and Team Leads. A Team Lead can hold tags of
 * their own, so they may review anyone's work except their own — see the
 * self-review guard below. SMEs and Actionees never review.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, SUPERVISOR_ROLES);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: 'Action must be "approve" or "reject".' },
      { status: 400 },
    );
  }

  const submission = await prisma.domainTagSubmission.findUnique({
    where: { id },
    include: {
      assignment: {
        include: {
          project: { select: { name: true } },
          division: { select: { name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  /**
   * Nobody signs off their own delivery. Admins and Leads can never hold
   * tags — only WORKING_ROLES can be assigned them — so in practice this
   * only ever stops a Team Lead approving the work they did themselves,
   * which is the whole reason review is a separate step.
   *
   * Keyed on the assignee rather than the submitter: a Lead may file a
   * count on someone's behalf, and it is still that someone's work.
   */
  if (submission.assignment.assignee.id === user.id) {
    return NextResponse.json(
      {
        error:
          "You can't review your own submission — another Team Lead, a Lead or an Admin has to.",
      },
      { status: 403 },
    );
  }

  if (submission.status !== "Pending") {
    return NextResponse.json(
      { error: `This submission was already ${submission.status.toLowerCase()}.` },
      { status: 409 },
    );
  }

  const reviewNote =
    typeof body.reviewNote === "string" && body.reviewNote.trim()
      ? body.reviewNote.trim()
      : null;

  // Whether to tell the actionee. Defaults to on whenever the decision
  // differs from what they claimed — a silent haircut is the one outcome
  // nobody should discover by accident. `notify: false` opts out.
  const notifyRequested = body.notify;

  if (action === "reject") {
    const updated = await prisma.domainTagSubmission.update({
      where: { id },
      data: {
        status: "Rejected",
        approvedCount: 0,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote,
      },
      include: { assignment: true },
    });

    let notified = false;
    if (notifyRequested !== false) {
      await notifyActionee({
        toEmail: submission.assignment.assignee.email,
        actioneeName: submission.assignment.assignee.name,
        projectName: submission.assignment.project.name,
        divisionName: submission.assignment.division?.name ?? null,
        date: toISODate(submission.date),
        submitted: submission.completedCount,
        approved: 0,
        outcome: "Rejected",
        reviewerName: user.name,
        reviewNote,
      });
      notified = true;
    }

    return NextResponse.json({
      submission: {
        id: updated.id,
        status: updated.status,
        approvedCount: updated.approvedCount,
        date: toISODate(updated.date),
        deliveredCount: updated.assignment.deliveredCount,
      },
      notified,
    });
  }

  // A Lead can sign off fewer tags than were claimed ("I verified 60 of
  // your 70"). Absent an explicit number, the claim stands as-is.
  const approvedCount =
    body.approvedCount === undefined || body.approvedCount === null
      ? submission.completedCount
      : Number(body.approvedCount);
  if (!Number.isInteger(approvedCount) || approvedCount < 0) {
    return NextResponse.json(
      { error: "Approved count must be a whole number of 0 or more." },
      { status: 400 },
    );
  }
  if (approvedCount > submission.completedCount) {
    return NextResponse.json(
      { error: "You can't approve more tags than were submitted." },
      { status: 400 },
    );
  }

  const headroom =
    submission.assignment.assignedCount - submission.assignment.deliveredCount;
  if (approvedCount > headroom) {
    return NextResponse.json(
      { error: `Only ${headroom} tag(s) remain on this assignment.` },
      { status: 400 },
    );
  }

  /**
   * The check above is advisory: it reads deliveredCount, and by the time we
   * write, another approval on the same assignment may already have consumed
   * that headroom. "Approve all" fires reviews in parallel, so this is the
   * common case rather than a rare one — left unguarded it pushes delivered
   * past assigned and silently inflates every rate derived from it.
   *
   * Both writes below are therefore conditional and atomic:
   *   - the submission only moves out of Pending if it is still Pending, so
   *     the same one can't be approved twice concurrently;
   *   - the counter only advances if the headroom genuinely still exists.
   * Either condition failing rolls the whole transaction back.
   */
  const CONFLICT = "HEADROOM_TAKEN";
  const ALREADY = "ALREADY_REVIEWED";
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.domainTagSubmission.updateMany({
        where: { id, status: "Pending" },
        data: {
          status: "Approved",
          approvedCount,
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNote,
        },
      });
      if (claimed.count === 0) throw new Error(ALREADY);

      const moved = await tx.domainTagAssignment.updateMany({
        where: {
          id: submission.assignmentId,
          // Compare-and-set: only if this many tags are still free.
          deliveredCount: {
            lte: submission.assignment.assignedCount - approvedCount,
          },
        },
        data: { deliveredCount: { increment: approvedCount } },
      });
      if (moved.count === 0) throw new Error(CONFLICT);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === ALREADY) {
      return NextResponse.json(
        { error: "This submission was already reviewed." },
        { status: 409 },
      );
    }
    if (msg === CONFLICT) {
      const fresh = await prisma.domainTagAssignment.findUnique({
        where: { id: submission.assignmentId },
        select: { assignedCount: true, deliveredCount: true },
      });
      const left = Math.max(
        0,
        (fresh?.assignedCount ?? 0) - (fresh?.deliveredCount ?? 0),
      );
      return NextResponse.json(
        {
          error: `Another approval got there first — only ${left} tag(s) remain on this assignment.`,
        },
        { status: 409 },
      );
    }
    throw e;
  }

  const updated = await prisma.domainTagSubmission.findUnique({ where: { id } });
  const assignment = await prisma.domainTagAssignment.findUnique({
    where: { id: submission.assignmentId },
    select: { assignedCount: true, deliveredCount: true, projectId: true },
  });

  // Notify by default when the Lead signed off a different number than was
  // claimed; on an exact match only if they asked for it.
  const countChanged = approvedCount !== submission.completedCount;
  let notified = false;
  if (notifyRequested === true || (notifyRequested !== false && countChanged)) {
    await notifyActionee({
      toEmail: submission.assignment.assignee.email,
      actioneeName: submission.assignment.assignee.name,
      projectName: submission.assignment.project.name,
      divisionName: submission.assignment.division?.name ?? null,
      date: toISODate(submission.date),
      submitted: submission.completedCount,
      approved: approvedCount,
      outcome: "Approved",
      reviewerName: user.name,
      reviewNote,
    });
    notified = true;
  }

  return NextResponse.json({
    submission: {
      id,
      status: updated?.status ?? "Approved",
      approvedCount: updated?.approvedCount ?? approvedCount,
      date: toISODate(updated?.date ?? submission.date),
      deliveredCount: assignment?.deliveredCount ?? 0,
      assignedCount: assignment?.assignedCount ?? 0,
      projectId: assignment?.projectId ?? null,
    },
    notified,
  });
}
