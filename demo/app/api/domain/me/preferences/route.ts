import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";

/**
 * Your own display preferences.
 *
 * Deliberately separate from PATCH /api/domain/me, which is Supervisors
 * only: that route changes your name and sign-in email, which is how
 * everyone else identifies you on a picker, an approval and a delivery
 * record. Choosing what your own sidebar shows is nothing like renaming
 * yourself, and gating it behind the same role would leave the people most
 * likely to want a tasks-only view — Actionees and SMEs — unable to set it.
 *
 * Only ever your own row. There is no id in this route by design: an Admin
 * cannot set somebody else's view from here, because a preference someone
 * else can change for you is not a preference.
 *
 * And it hides nav entries, nothing else. Every permission check elsewhere
 * is untouched, because a display flag must never become load-bearing for
 * access — anyone who turns this on still reaches the same pages by URL,
 * and anyone who turns it off gains nothing they did not already have.
 */

/**
 * What this person's preferences currently are.
 *
 * Separate from /api/domain/me, which every page loads on boot: standing
 * reviewers are wanted by exactly one screen, and putting them on the
 * session payload would ship a join to every request that needs none.
 */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const rows = await prisma.domainDefaultReviewer.findMany({
    where: { ownerId: user.id },
    include: { reviewer: { select: { id: true, name: true, role: true, isActive: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    taskLogOnly: user.taskLogOnly,
    /**
     * Deactivated people are dropped on the way out rather than deleted.
     *
     * Somebody going inactive is usually temporary — a secondment, leave —
     * and wiping a standing choice the moment they do would mean quietly
     * rebuilding it when they come back. They simply stop being suggested.
     */
    defaultReviewers: rows
      .filter((r) => r.reviewer.isActive)
      .map((r) => ({ id: r.reviewer.id, name: r.reviewer.name, role: r.reviewer.role })),
  });
}

export async function PATCH(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const body = await req.json().catch(() => ({}));

  /**
   * Standing reviewers: replace the set, don't merge it.
   *
   * The caller sends the list it wants to end up with, which is what the
   * form actually knows — merging would make removing somebody impossible
   * without a second verb.
   */
  if (body.defaultReviewerIds !== undefined) {
    if (!Array.isArray(body.defaultReviewerIds)) {
      return NextResponse.json(
        { error: "defaultReviewerIds must be a list." },
        { status: 400 },
      );
    }
    const cleaned = (body.defaultReviewerIds as unknown[])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      // Naming yourself would put you on your own approval queue for work
      // you raised, which the review flow already treats as no reviewer.
      .filter((id) => id !== user.id);
    const wanted: string[] = [...new Set(cleaned)];

    if (wanted.length > MAX_DEFAULT_REVIEWERS) {
      return NextResponse.json(
        {
          error: `Pick at most ${MAX_DEFAULT_REVIEWERS} standing reviewers.`,
        },
        { status: 400 },
      );
    }

    // Checked against the table, not trusted: an id that is not an active
    // account would sit in the list pre-filling nobody.
    const real = await prisma.domainUser.findMany({
      where: { id: { in: wanted }, isActive: true },
      select: { id: true },
    });
    const valid = new Set(real.map((r) => r.id));
    const bad = wanted.filter((id) => !valid.has(id));
    if (bad.length > 0) {
      return NextResponse.json(
        { error: "One of those people no longer has an active account." },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      prisma.domainDefaultReviewer.deleteMany({ where: { ownerId: user.id } }),
      prisma.domainDefaultReviewer.createMany({
        data: wanted.map((reviewerId) => ({ ownerId: user.id, reviewerId })),
      }),
    ]);
  }

  if (body.taskLogOnly !== undefined) {
    if (typeof body.taskLogOnly !== "boolean") {
      return NextResponse.json(
        { error: "taskLogOnly must be true or false." },
        { status: 400 },
      );
    }
    await prisma.domainUser.update({
      where: { id: user.id },
      data: { taskLogOnly: body.taskLogOnly },
    });
  }

  if (body.taskLogOnly === undefined && body.defaultReviewerIds === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.domainUser.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, name: true, email: true, role: true, taskLogOnly: true },
  });
  return NextResponse.json({ user: updated });
}

/** Enough for a lead and a checker. More is a list, not a default. */
const MAX_DEFAULT_REVIEWERS = 5;
