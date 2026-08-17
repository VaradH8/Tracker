import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { SUPERVISOR_ROLES } from "@/lib/domain";
import { allocationConflicts } from "@/lib/domain-forecast";
import { forecastDelivery, splitRate, toISODate } from "@/lib/forecast";

/**
 * What-if forecasting. A Lead enters a tag count, the people they'd put on
 * it, the rate to plan each of them at, and a handover date; we answer
 * with an estimated delivery date and whether that date holds.
 *
 * The rates are supplied, never inferred — see the block below.
 *
 * Writes nothing. It also reports any allocation clashes for the proposed
 * window, so a plan that only works by double-booking someone says so.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, SUPERVISOR_ROLES);
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
  const handoverDate = body.handoverDate ? new Date(String(body.handoverDate)) : null;
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
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
  const missing = rated.filter((r) => r.rate === null);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Set a tags/day rate for ${missing.map((m) => m.person.name).join(", ")} — the simulation plans at the rate you give it, not at one it guesses.`,
      },
      { status: 400 },
    );
  }

  const resources = rated.map(({ person, rate }) => {
    // +1 for this hypothetical project itself.
    const concurrentProjects = (clashesById.get(person.id)?.length ?? 0) + 1;
    const fullRate = rate as number;
    return {
      id: person.id,
      name: person.name,
      role: person.role,
      rate: splitRate(fullRate, concurrentProjects),
      fullRate,
      concurrentProjects,
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
      resources,
      forecast,
      conflicts,
    },
  });
}
