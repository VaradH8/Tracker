import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { PORTFOLIO_VIEWER_ROLES } from "@/lib/domain";
import { allocationConflicts } from "@/lib/domain-forecast";
import { forecastDelivery, rateIssue, splitRate, toISODate } from "@/lib/forecast";
import {
  DEFAULT_WORK_WEEK,
  MAX_WORKING_DAYS,
  handoverFrom,
  isWorkWeek,
} from "@/lib/domain-workdays";
import { dayToDate, holidaySet } from "@/lib/domain-schedule";

/**
 * What-if forecasting. A Lead enters a tag count, the people they'd put on
 * it, the rate to plan each of them at, and a handover date; we answer
 * with an estimated delivery date and whether that date holds.
 *
 * The rates are supplied, never inferred — see the block below.
 *
 * Writes nothing — it reads people and existing bookings and answers a
 * question. That is why it sits behind PORTFOLIO_VIEWER_ROLES rather than
 * SUPERVISOR_ROLES: asking "what would it take to hit this date" is a
 * question an executive should be able to put to the system directly,
 * and it changes nothing whatever the answer.
 *
 * It also reports any allocation clashes for the proposed window, so a
 * plan that only works by double-booking someone says so.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, PORTFOLIO_VIEWER_ROLES);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));

  const totalTags = Number(body.totalTags);
  if (!Number.isInteger(totalTags) || totalTags < 1) {
    return NextResponse.json(
      { error: "How many tags? Enter a whole number of 1 or more." },
      { status: 400 },
    );
  }

  const resourceIds: string[] = Array.isArray(body.resourceIds)
    ? Array.from(new Set(body.resourceIds.map((id: unknown) => String(id))))
    : [];
  if (resourceIds.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one resource to run the simulation." },
      { status: 400 },
    );
  }

  const startDate = body.startDate ? new Date(String(body.startDate)) : new Date();
  // Validated before anything reads it — the derivation below formats it
  // as an ISO day, which an invalid Date cannot survive.
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
  }

  /**
   * The handover to simulate against: either derived from a working-day
   * count, or typed in directly.
   *
   * Derived wins when both arrive, and it is computed here rather than
   * taken from the request — a what-if answered against a date the
   * browser worked out its own way would disagree with the same project
   * once it was actually created.
   */
  let handoverDate = body.handoverDate ? new Date(String(body.handoverDate)) : null;
  let derivedHandover: ReturnType<typeof handoverFrom> = null;
  if (
    body.totalWorkingDays !== undefined &&
    body.totalWorkingDays !== null &&
    body.totalWorkingDays !== ""
  ) {
    const total = Number(body.totalWorkingDays);
    const week =
      body.workingDaysPerWeek === undefined || body.workingDaysPerWeek === null
        ? DEFAULT_WORK_WEEK
        : Number(body.workingDaysPerWeek);
    if (!isWorkWeek(week)) {
      return NextResponse.json(
        { error: "Working week must be 5 or 6 days." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(total) || total < 1 || total > MAX_WORKING_DAYS) {
      return NextResponse.json(
        {
          error: `Total working days must be a whole number between 1 and ${MAX_WORKING_DAYS}.`,
        },
        { status: 400 },
      );
    }
    derivedHandover = handoverFrom(
      toISODate(startDate),
      total,
      week,
      await holidaySet(),
    );
    if (!derivedHandover) {
      return NextResponse.json(
        { error: "Couldn't work out a handover date from those." },
        { status: 400 },
      );
    }
    handoverDate = dayToDate(derivedHandover.handover);
  }

  if (handoverDate && Number.isNaN(handoverDate.getTime())) {
    return NextResponse.json({ error: "Invalid handover date." }, { status: 400 });
  }

  const people = await prisma.domainUser.findMany({
    where: { id: { in: resourceIds }, isActive: true },
    select: { id: true, name: true, role: true },
  });
  if (people.length === 0) {
    return NextResponse.json(
      { error: "None of those resources exist." },
      { status: 400 },
    );
  }

  // Existing bookings that overlap the proposed window: the simulated
  // project would be one more call on the same person, so their rate is
  // shared rather than assumed whole. Without a handover date there's no
  // window to test, and we take them as undivided.
  const existing = handoverDate
    ? await Promise.all(
        people.map(async (p) => ({
          id: p.id,
          clashes: await allocationConflicts(p.id, startDate, handoverDate),
        })),
      )
    : [];
  const clashesById = new Map(existing.map((e) => [e.id, e.clashes]));

  /**
   * The rate to plan each person at, typed into the form.
   *
   * This is the ONLY source. The simulator deliberately does not fall back
   * to a measured rate, a booking rate, or a house default: a what-if is
   * an assumption you are making on purpose, and quietly substituting
   * history for the number you meant to supply is how a simulation ends up
   * answering a question nobody asked. If a rate is missing, we say so
   * rather than invent one.
   */
  const overrides: Record<string, unknown> =
    body.rateOverrides && typeof body.rateOverrides === "object"
      ? (body.rateOverrides as Record<string, unknown>)
      : {};

  const rated = people.map((p) => {
    const raw = Number(overrides[p.id]);
    return {
      person: p,
      rate: Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null,
    };
  });
  // A simulation run at 10,000 tags a day answers a question nobody
  // asked. Same ceiling as the real forecast, refused at the door here
  // because there is no stored record to fall back on.
  const absurd = rated.filter((r) => r.rate !== null && rateIssue(r.rate));
  if (absurd.length > 0) {
    return NextResponse.json(
      { error: rateIssue(absurd[0].rate) },
      { status: 400 },
    );
  }

  const missing = rated.filter((r) => r.rate === null);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Set a tags/day rate for ${missing.map((m) => m.person.name).join(", ")} — the simulation plans at the rate you give it, not at one it guesses.`,
      },
      { status: 400 },
    );
  }

  /**
   * Whether the rates typed in are already per-project.
   *
   * Off, each is divided by the number of overlapping bookings, on the
   * assumption that the figure describes the person's whole day. On, it
   * is used as given — which is what you want when you typed "10/day on
   * this project" having already accounted for the fact that they are
   * shared. Every rate here is explicitly supplied, so unlike the
   * forecast there is no whole-person figure mixed in that would still
   * need sharing.
   */
  const usePerProjectRates = body.usePerProjectRates === true;

  const resources = rated.map(({ person, rate }) => {
    // +1 for this hypothetical project itself.
    const concurrentProjects = (clashesById.get(person.id)?.length ?? 0) + 1;
    const fullRate = rate as number;
    return {
      id: person.id,
      name: person.name,
      role: person.role,
      rate: splitRate(fullRate, usePerProjectRates ? 1 : concurrentProjects),
      fullRate,
      concurrentProjects,
      rateIsPerProject: usePerProjectRates,
      // Always false: every rate here was just typed in and validated
      // above, so none can be over the ceiling. Present so the simulator
      // and the forecast hand back the same shape.
      rateClamped: false,
    };
  });

  const forecast = forecastDelivery({
    remainingTags: totalTags,
    rates: resources.map((r) => r.rate),
    from: startDate,
    handoverDate,
  });

  // Reuses the overlap lookup done above for the rate split — the same
  // bookings that divide someone's time are the ones worth reporting.
  const conflicts = people
    .map((p) => ({
      resourceId: p.id,
      resourceName: p.name,
      conflicts: clashesById.get(p.id) ?? [],
    }))
    .filter((r) => r.conflicts.length > 0);

  return NextResponse.json({
    simulation: {
      totalTags,
      startDate: toISODate(startDate),
      handoverDate: handoverDate ? toISODate(handoverDate) : null,
      usePerProjectRates,
      // Present only when the date was calculated, so the form can show
      // which days were skipped to reach it.
      derivedHandover,
      resources,
      forecast,
      conflicts,
    },
  });
}
