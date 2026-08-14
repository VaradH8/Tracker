import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { istParts } from "@/lib/domain";
import { projectForecasts, resourceForecast } from "@/lib/domain-forecast";
import { toISODate } from "@/lib/forecast";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const TREND_WEEKS = 6;

/**
 * Delivery KPIs for the admin dashboard.
 *
 * These used to count DomainTask rows and logged hours — the old task
 * system — while the module itself runs on tags and approvals. The numbers
 * were real but described something nobody manages, so an Admin could not
 * reconcile this page against the forecast. Everything here now derives
 * from the same source the forecast trusts: what a Lead has approved.
 *
 * Four questions, in the order a review asks them:
 *   1. Is the portfolio going to land?      — projects behind, tags at risk
 *   2. Who is delivering, and how reliably? — per person, claimed vs approved
 *   3. Is review itself a bottleneck?       — turnaround, per reviewer
 *   4. Is the data trustworthy?             — gaps that silently skew 1–3
 */

/** Median rather than mean: one forgotten submission left open over a
 *  weekend would otherwise dominate an average and hide the norm. */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(v * 10) / 10;
}

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin"]);
  if (forbidden) return forbidden;

  const now = new Date();
  const cut30 = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  // Week buckets for the trend, Monday-aligned in IST. Work dates are
  // stored as midnight UTC of the IST day, so UTC day arithmetic is exact.
  const today = new Date(istParts(now).dateISO + "T00:00:00.000Z");
  const thisMonday = new Date(
    today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS,
  );
  const weekStarts = Array.from(
    { length: TREND_WEEKS },
    (_, i) => new Date(thisMonday.getTime() - (TREND_WEEKS - 1 - i) * 7 * DAY_MS),
  );

  const [submissions, projects, resources, logs] = await Promise.all([
    prisma.domainTagSubmission.findMany({
      where: { date: { gte: weekStarts[0] } },
      select: {
        date: true,
        status: true,
        completedCount: true,
        approvedCount: true,
        createdAt: true,
        reviewedAt: true,
        reviewedById: true,
        reviewedBy: { select: { id: true, name: true } },
        assignment: {
          select: {
            assignee: { select: { id: true, name: true, role: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    }),
    projectForecasts(),
    resourceForecast(),
    prisma.domainWorkLog.findMany({
      where: { date: { gte: cut30 } },
      select: { hours: true },
    }),
  ]);

  const inWindow = submissions.filter((s) => s.date >= cut30);
  const decided = inWindow.filter((s) => s.status !== "Pending");
  const approvedRows = inWindow.filter((s) => s.status === "Approved");
  const approvedOf = (s: { approvedCount: number | null }) => s.approvedCount ?? 0;

  /* ---- 2. per person ------------------------------------------------ */
  const people = resources.map((r) => {
    const mine = inWindow.filter((s) => s.assignment.assignee.id === r.id);
    const mineDecided = mine.filter((s) => s.status !== "Pending");
    const claimed = mineDecided.reduce((a, s) => a + s.completedCount, 0);
    const approved = mineDecided.reduce((a, s) => a + approvedOf(s), 0);
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      delivered30: approved,
      claimed30: claimed,
      /** Approved as a share of claimed — a standing gap is worth a word. */
      approvalRate: pct(approved, claimed),
      /** Times a Lead signed off fewer tags than were claimed. */
      reworked: mineDecided.filter(
        (s) => s.status === "Approved" && approvedOf(s) < s.completedCount,
      ).length,
      rejected: mineDecided.filter((s) => s.status === "Rejected").length,
      pending: mine.filter((s) => s.status === "Pending").length,
      openTags: r.openTags,
      measuredRate: r.measuredRate,
      status: r.status,
    };
  });

  /* ---- 3. review turnaround ----------------------------------------- */
  // Hours between the claim being filed and a Lead deciding it. This
  // measures reviewers, not the people doing the work — a slow approver
  // stalls delivery and nothing else on the site surfaces it.
  const turnaroundOf = (s: { createdAt: Date; reviewedAt: Date | null }) =>
    s.reviewedAt ? (s.reviewedAt.getTime() - s.createdAt.getTime()) / 3600000 : null;

  const reviewerIds = Array.from(
    new Set(decided.map((s) => s.reviewedById).filter((x): x is string => !!x)),
  );
  const reviewers = reviewerIds.map((id) => {
    const theirs = decided.filter((s) => s.reviewedById === id);
    const hours = theirs
      .map(turnaroundOf)
      .filter((h): h is number => h !== null && h >= 0);
    return {
      id,
      name: theirs[0]?.reviewedBy?.name ?? "Unknown",
      reviewed: theirs.length,
      tagsApproved: theirs.reduce((a, s) => a + approvedOf(s), 0),
      medianHours: median(hours),
      adjusted: theirs.filter(
        (s) => s.status === "Approved" && approvedOf(s) < s.completedCount,
      ).length,
      rejected: theirs.filter((s) => s.status === "Rejected").length,
    };
  });
  reviewers.sort((a, b) => b.reviewed - a.reviewed);

  const pendingRows = submissions.filter((s) => s.status === "Pending");
  const oldestPending = pendingRows.reduce<Date | null>(
    (min, s) => (min === null || s.createdAt < min ? s.createdAt : min),
    null,
  );

  /* ---- 1. portfolio -------------------------------------------------- */
  const behind = projects.filter((p) => p.forecast.status === "Behind Schedule");
  const atRisk = behind.map((p) => ({
    id: p.id,
    name: p.name,
    handoverDate: p.handoverDate,
    projectedDate: p.forecast.projectedDate,
    slackDays: p.forecast.slackDays,
    remainingTags: p.remainingTags,
    peopleEngaged: p.peopleEngaged,
  }));
  atRisk.sort((a, b) => (a.slackDays ?? 0) - (b.slackDays ?? 0));

  /* ---- 4. data quality ----------------------------------------------- */
  // Gaps that quietly distort everything above: work nobody is booked for,
  // and bookings the forecast has no rate to plan with.
  const unbooked = resources
    .filter((r) => r.openTagProjects.length > 0)
    .flatMap((r) =>
      r.openTagProjects.map((p) => ({
        userId: r.id,
        name: r.name,
        projectId: p.projectId,
        projectName: p.projectName,
        openTags: p.openTags,
      })),
    );

  const unrated = projects.flatMap((p) =>
    p.resources
      .filter((r) => r.usingDefaultRate)
      .map((r) => ({
        userId: r.id,
        name: r.name,
        projectId: p.id,
        projectName: p.name,
      })),
  );

  /* ---- trend ---------------------------------------------------------- */
  const weeks = weekStarts.map((start) => {
    const end = new Date(start.getTime() + 7 * DAY_MS);
    const rows = submissions.filter((s) => s.date >= start && s.date < end);
    return {
      label: start.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      startDate: toISODate(start),
      claimed: rows.reduce((a, s) => a + s.completedCount, 0),
      delivered: rows
        .filter((s) => s.status === "Approved")
        .reduce((a, s) => a + approvedOf(s), 0),
    };
  });

  const claimed30 = decided.reduce((a, s) => a + s.completedCount, 0);
  const delivered30 = approvedRows.reduce((a, s) => a + approvedOf(s), 0);
  const allTurnaround = decided
    .map(turnaroundOf)
    .filter((h): h is number => h !== null && h >= 0);

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    totals: {
      delivered30,
      claimed30,
      approvalRate: pct(delivered30, claimed30),
      medianReviewHours: median(allTurnaround),
      pendingCount: pendingRows.length,
      pendingTags: pendingRows.reduce((a, s) => a + s.completedCount, 0),
      oldestPendingDays: oldestPending
        ? Math.floor((now.getTime() - oldestPending.getTime()) / DAY_MS)
        : null,
      projectsTotal: projects.length,
      projectsBehind: behind.length,
      tagsAtRisk: behind.reduce((a, p) => a + p.remainingTags, 0),
      slackDaysWorst: behind.length
        ? Math.min(...behind.map((p) => p.forecast.slackDays ?? 0))
        : null,
      peopleTotal: resources.length,
      peopleFree: resources.filter((r) => r.status === "Free").length,
      hours30: round(logs.reduce((a, l) => a + l.hours, 0)),
    },
    people,
    reviewers,
    atRisk,
    weeks,
    quality: { unbooked, unrated },
  });
}
