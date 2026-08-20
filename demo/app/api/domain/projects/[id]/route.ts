import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  LIVE_ASSIGNMENT,
  TAG_HOLDER_ROLES,
  divisionTagsIssue,
  type DomainRole,
} from "@/lib/domain";
import { toISODate } from "@/lib/forecast";
import {
  DEFAULT_WORK_WEEK,
  MAX_WORKING_DAYS,
  handoverFrom,
  isWorkWeek,
} from "@/lib/domain-workdays";
import { dayToDate, holidaySet } from "@/lib/domain-schedule";

const INCLUDE = {
  owner: { select: { id: true, name: true } },
  _count: { select: { tasks: true } },
  divisions: { include: { division: { select: { id: true, name: true } } } },
  allocations: { include: { user: { select: { id: true, name: true } } } },
} as const;

function serialize(p: {
  id: number;
  name: string;
  description: string | null;
  owner: { id: string; name: string };
  _count: { tasks: number };
  createdAt: Date;
  startDate: Date | null;
  handoverDate: Date | null;
  contractTags: number | null;
  workingDaysPerWeek: number | null;
  totalWorkingDays: number | null;
  totalTags: number;
  client: string | null;
  divisions: {
    divisionId: number;
    totalTags: number;
    division: { id: number; name: string };
  }[];
  allocations: {
    id: number;
    startDate: Date;
    endDate: Date;
    releasedAt: Date | null;
    user: { id: string; name: string };
  }[];
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    owner: p.owner.name,
    ownerId: p.owner.id,
    taskCount: p._count.tasks,
    createdAt: p.createdAt.toISOString(),
    startDate: p.startDate ? toISODate(p.startDate) : null,
    handoverDate: p.handoverDate ? toISODate(p.handoverDate) : null,
    contractTags: p.contractTags,
    workingDaysPerWeek: p.workingDaysPerWeek,
    totalWorkingDays: p.totalWorkingDays,
    totalTags: p.totalTags,
    client: p.client,
    divisions: p.divisions.map((d) => ({
      id: d.division.id,
      name: d.division.name,
      totalTags: d.totalTags,
    })),
    resources: p.allocations.map((a) => ({
      allocationId: a.id,
      id: a.user.id,
      name: a.user.name,
      startDate: toISODate(a.startDate),
      endDate: toISODate(a.endDate),
      releasedAt: a.releasedAt ? toISODate(a.releasedAt) : null,
    })),
  };
}

/**
 * Any Lead or Admin may edit or delete a project.
 *
 * This used to be owner-only, which meant a Lead couldn't touch a project
 * a colleague (or a departed Lead) had created — including older projects
 * whose owner no longer works on them. Leads run the same book of work, so
 * they share the same rights over it; Team Leads, SMEs and Actionees still
 * can't.
 */
async function authorize(id: number, role: string) {
  // Role first, then existence: checking the other way round lets someone
  // without rights tell which project ids exist by the 404-vs-403 answer.
  if (role !== "Admin" && role !== "Lead") return "forbidden" as const;
  const project = await prisma.domainProject.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!project) return "notfound" as const;
  return "ok" as const;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const auth = await authorize(id, user.role);
  if (auth === "notfound") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null) {
    data.description = body.description ? String(body.description).trim() : null;
  }

  // Forecast inputs. Each is independently clearable with null, so a Lead
  // can drop a handover date they set by mistake.
  for (const field of ["startDate", "handoverDate"] as const) {
    if (body[field] === undefined) continue;
    if (body[field] === null || body[field] === "") {
      data[field] = null;
      continue;
    }
    const d = new Date(String(body[field]));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: `Invalid ${field}.` }, { status: 400 });
    }
    data[field] = d;
  }
  // null clears it back to "not tracked".
  if (body.contractTags !== undefined) {
    if (body.contractTags === null || body.contractTags === "") {
      data.contractTags = null;
    } else {
      const n = Number(body.contractTags);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "Contract scope must be a whole number of 0 or more." },
          { status: 400 },
        );
      }
      data.contractTags = n;
    }
  }

  if (body.totalTags !== undefined) {
    const tags = Number(body.totalTags);
    if (!Number.isInteger(tags) || tags < 0) {
      return NextResponse.json(
        { error: "Total tags must be a whole number of 0 or more." },
        { status: 400 },
      );
    }
    data.totalTags = tags;
  }

  if (typeof body.client === "string" || body.client === null) {
    data.client = body.client ? String(body.client).trim() : null;
  }

  const current = await prisma.domainProject.findUnique({
    where: { id },
    include: { divisions: true },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /**
   * Handover from a working-day count.
   *
   * A partial update, so anything the request leaves out falls back to
   * what the project already has — changing only the working week must
   * recalculate against the stored start date and day count, not wipe
   * them.
   *
   * Sending `totalWorkingDays: null`, or typing a handover date directly,
   * stops the derivation: the stored count no longer explains the date,
   * and keeping it would silently recompute a different one next time
   * anybody opened the form.
   */
  const wantsDerived =
    body.totalWorkingDays !== undefined &&
    body.totalWorkingDays !== null &&
    body.totalWorkingDays !== "";

  if (wantsDerived) {
    const startFor =
      (data.startDate as Date | null | undefined) ?? current.startDate;
    if (!startFor) {
      return NextResponse.json(
        { error: "A start date is needed to work out the handover date." },
        { status: 400 },
      );
    }
    const total = Number(body.totalWorkingDays);
    if (!Number.isInteger(total) || total < 1 || total > MAX_WORKING_DAYS) {
      return NextResponse.json(
        {
          error: `Total working days must be a whole number between 1 and ${MAX_WORKING_DAYS}.`,
        },
        { status: 400 },
      );
    }
    const week =
      body.workingDaysPerWeek === undefined || body.workingDaysPerWeek === null
        ? current.workingDaysPerWeek ?? DEFAULT_WORK_WEEK
        : Number(body.workingDaysPerWeek);
    if (!isWorkWeek(week)) {
      return NextResponse.json(
        { error: "Working week must be 5 or 6 days." },
        { status: 400 },
      );
    }
    const derived = handoverFrom(
      toISODate(startFor),
      total,
      week,
      await holidaySet(),
    );
    if (!derived) {
      return NextResponse.json(
        { error: "Couldn't work out a handover date from those." },
        { status: 400 },
      );
    }
    data.startDate = startFor;
    data.handoverDate = dayToDate(derived.handover);
    data.workingDaysPerWeek = week;
    data.totalWorkingDays = total;
  } else if (body.totalWorkingDays === null || data.handoverDate !== undefined) {
    data.workingDaysPerWeek = null;
    data.totalWorkingDays = null;
  }

  const start =
    data.startDate !== undefined ? (data.startDate as Date | null) : current.startDate;
  const handover =
    data.handoverDate !== undefined
      ? (data.handoverDate as Date | null)
      : current.handoverDate;
  if (start && handover && handover < start) {
    return NextResponse.json(
      { error: "Handover can't fall before the project starts." },
      { status: 400 },
    );
  }

  // --- Divisions -----------------------------------------------------
  // `divisions: [{ divisionId? | name, totalTags }]` replaces the set. A
  // division still carrying assigned tags can't be dropped — that would
  // orphan work people are holding.
  let divisionPlan: { divisionId: number; totalTags: number }[] | null = null;
  /**
   * Tags to re-point when a project moves off a shared division onto its
   * own. Collected during validation, applied in the transaction — a
   * request that fails a later check must not have moved anything.
   */
  const divisionMoves: { from: number; to: number }[] = [];
  if (Array.isArray(body.divisions)) {
    const catalogue = await prisma.domainDivision.findMany({
      select: { id: true, name: true },
    });
    const byLowerName = new Map(catalogue.map((d) => [d.name.toLowerCase(), d]));
    const validIds = new Set(catalogue.map((d) => d.id));
    const plan: { divisionId: number; totalTags: number }[] = [];

    for (const raw of body.divisions as {
      divisionId?: unknown;
      name?: unknown;
      totalTags?: unknown;
    }[]) {
      const tags = Number(raw.totalTags ?? 0);
      const divisionTags = Number.isInteger(tags) && tags > 0 ? tags : 0;

      if (raw.divisionId !== undefined && raw.divisionId !== null && raw.divisionId !== "") {
        const divId = Number(raw.divisionId);
        if (!validIds.has(divId)) {
          return NextResponse.json({ error: "Unknown division." }, { status: 400 });
        }

        /**
         * Renaming a division you already have.
         *
         * This branch used to take the id and drop `name` on the floor, so
         * editing a division's name in the project form saved cleanly,
         * returned 200, and changed nothing. Silent, which is the worst
         * way for an edit to fail.
         *
         * Divisions are a shared catalogue: one row, linked to however
         * many projects use it. Typing "Piping" on a second project finds
         * the existing row rather than making another, so by the time
         * anybody wants to rename it, it is usually shared — and a rename
         * means one of two quite different things.
         *
         * It means "this project's division is now called X". So that is
         * what it does: where the row is shared, the project moves onto
         * its own division under the new name and takes its tags with it,
         * and every other project keeps the one it had. Where the row
         * belongs to this project alone, there is nothing to move and it
         * is renamed in place.
         *
         * The alternative — renaming the shared row — would retitle a
         * discipline on somebody else's project from inside this form,
         * which is not a thing this screen should be able to do.
         */
        const wanted = String(raw.name ?? "").trim();
        const existing = catalogue.find((d) => d.id === divId);
        if (wanted && existing && wanted !== existing.name) {
          const clash = byLowerName.get(wanted.toLowerCase());
          // Renaming onto a division this project already has would merge
          // two sets of tags into one, which is a different operation and
          // not one anybody asked for by typing in a name field.
          if (clash && clash.id !== divId) {
            const alreadyHere = current.divisions.some(
              (d) => d.divisionId === clash.id,
            );
            if (alreadyHere) {
              return NextResponse.json(
                {
                  error: `This project already has a division called "${clash.name}". Merge them by moving the tags across, or pick a different name.`,
                },
                { status: 400 },
              );
            }
          }

          const usedElsewhere = await prisma.domainProjectDivision.count({
            where: { divisionId: divId, projectId: { not: id } },
          });

          if (usedElsewhere === 0) {
            // Ours alone: rename the row and keep the id, so nothing that
            // points at it has to move.
            const renamed = await prisma.domainDivision.update({
              where: { id: divId },
              data: { name: wanted },
              select: { id: true, name: true },
            });
            byLowerName.delete(existing.name.toLowerCase());
            byLowerName.set(renamed.name.toLowerCase(), renamed);
            existing.name = renamed.name;
            plan.push({ divisionId: divId, totalTags: divisionTags });
            continue;
          }

          // Shared: move this project onto a division of its own. Reuse a
          // row that already carries the name if there is one — two
          // divisions called the same thing is how the catalogue rots.
          let target = clash ?? null;
          if (!target) {
            target = await prisma.domainDivision.create({
              data: { name: wanted },
              select: { id: true, name: true },
            });
            catalogue.push(target);
            byLowerName.set(target.name.toLowerCase(), target);
            validIds.add(target.id);
          }
          // Applied in the transaction below, not here: nothing is written
          // until the rest of the request has passed validation.
          divisionMoves.push({ from: divId, to: target.id });
          plan.push({ divisionId: target.id, totalTags: divisionTags });
          continue;
        }

        plan.push({ divisionId: divId, totalTags: divisionTags });
        continue;
      }
      const divisionName = String(raw.name ?? "").trim();
      if (!divisionName) continue;
      const existingDiv = byLowerName.get(divisionName.toLowerCase());
      if (existingDiv) {
        plan.push({ divisionId: existingDiv.id, totalTags: divisionTags });
      } else {
        const created = await prisma.domainDivision.create({
          data: { name: divisionName },
          select: { id: true, name: true },
        });
        byLowerName.set(created.name.toLowerCase(), created);
        validIds.add(created.id);
        plan.push({ divisionId: created.id, totalTags: divisionTags });
      }
    }
    divisionPlan = Array.from(new Map(plan.map((d) => [d.divisionId, d])).values());

    const keptIds = new Set(divisionPlan.map((d) => d.divisionId));
    // A division being moved off is not being dropped — its tags follow it
    // — so it must not trip the "still has tags assigned" guard below.
    const movingFrom = new Set(divisionMoves.map((m) => m.from));
    const removedIds = current.divisions
      .filter((d) => !keptIds.has(d.divisionId) && !movingFrom.has(d.divisionId))
      .map((d) => d.divisionId);
    if (removedIds.length > 0) {
      const held = await prisma.domainTagAssignment.count({
        where: { projectId: id, divisionId: { in: removedIds } },
      });
      if (held > 0) {
        return NextResponse.json(
          {
            error:
              "A division you're removing still has tags assigned to people. Reassign or clear those first.",
          },
          { status: 400 },
        );
      }
    }
  }

  const nextTotal =
    data.totalTags !== undefined ? (data.totalTags as number) : current.totalTags;
  const effectiveDivisions =
    divisionPlan ??
    current.divisions.map((d) => ({ divisionId: d.divisionId, totalTags: d.totalTags }));
  const budgetIssue = divisionTagsIssue(
    nextTotal,
    effectiveDivisions.map((d) => d.totalTags),
  );
  if (budgetIssue) {
    return NextResponse.json({ error: budgetIssue }, { status: 400 });
  }

  // Dropping the master total below what's already handed out would leave
  // the project owing more than it holds.
  if (data.totalTags !== undefined && nextTotal > 0) {
    // Live work only. Tags belonging to somebody who has been taken off
    // the project are no longer handed out, so counting them would block
    // a total the project can perfectly well carry.
    const assigned = await prisma.domainTagAssignment.aggregate({
      where: { projectId: id, ...LIVE_ASSIGNMENT },
      _sum: { assignedCount: true },
    });
    const handedOut = assigned._sum.assignedCount ?? 0;
    if (nextTotal < handedOut) {
      return NextResponse.json(
        {
          error: `${handedOut} tags are already assigned to people — the project total can't go below that.`,
        },
        { status: 400 },
      );
    }
  }

  // --- Resources -----------------------------------------------------
  // `resourceIds: [...]` replaces the bookings. Someone still holding tags
  // can't be un-booked, for the same reason as divisions.
  let resourcePlan: string[] | null = null;
  if (Array.isArray(body.resourceIds)) {
    resourcePlan = Array.from(
      new Set((body.resourceIds as unknown[]).map((r) => String(r))),
    );
    if (resourcePlan.length > 0) {
      const people = await prisma.domainUser.findMany({
        where: { id: { in: resourcePlan }, isActive: true },
        select: { id: true, name: true, role: true },
      });
      if (people.length !== resourcePlan.length) {
        return NextResponse.json(
          { error: "One of those resources doesn't exist." },
          { status: 400 },
        );
      }
      for (const p of people) {
        if (!TAG_HOLDER_ROLES.includes(p.role as DomainRole)) {
          return NextResponse.json(
            {
              error: `${p.name} can't be allocated — only Actionees, SMEs, and Team Leads can.`,
            },
            { status: 400 },
          );
        }
      }
      if (!handover) {
        return NextResponse.json(
          {
            error:
              "Set a handover date before allocating resources — a booking needs an end date.",
          },
          { status: 400 },
        );
      }
    }
    const dropping = await prisma.domainAllocation.findMany({
      where: { projectId: id, userId: { notIn: resourcePlan } },
      select: { userId: true },
    });
    if (dropping.length > 0) {
      const stillHolding = await prisma.domainTagAssignment.findFirst({
        where: { projectId: id, assigneeId: { in: dropping.map((d) => d.userId) } },
        select: { assignee: { select: { name: true } } },
      });
      if (stillHolding) {
        return NextResponse.json(
          {
            error: `${stillHolding.assignee.name} still holds tags on this project. Reassign them before removing the booking.`,
          },
          { status: 400 },
        );
      }
    }
  }

  const hasChanges =
    Object.keys(data).length > 0 || divisionPlan !== null || resourcePlan !== null;
  if (!hasChanges) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.domainProject.update({ where: { id }, data });
    }
    // Before the links are rewritten: the tags have to land on the new
    // division while the old link still exists, or they would briefly
    // point at a division this project does not have.
    for (const move of divisionMoves) {
      await tx.domainTagAssignment.updateMany({
        where: { projectId: id, divisionId: move.from },
        data: { divisionId: move.to },
      });
    }
    if (divisionPlan) {
      await tx.domainProjectDivision.deleteMany({
        where: {
          projectId: id,
          divisionId: { notIn: divisionPlan.map((d) => d.divisionId) },
        },
      });
      for (const d of divisionPlan) {
        await tx.domainProjectDivision.upsert({
          where: {
            projectId_divisionId: { projectId: id, divisionId: d.divisionId },
          },
          create: { projectId: id, divisionId: d.divisionId, totalTags: d.totalTags },
          update: { totalTags: d.totalTags },
        });
      }
    }
    if (resourcePlan) {
      await tx.domainAllocation.deleteMany({
        where: { projectId: id, userId: { notIn: resourcePlan } },
      });
      if (handover) {
        for (const userId of resourcePlan) {
          await tx.domainAllocation.upsert({
            where: { projectId_userId: { projectId: id, userId } },
            create: {
              projectId: id,
              userId,
              startDate: start ?? new Date(),
              endDate: handover,
              createdById: user.id,
            },
            update: { endDate: handover, ...(start ? { startDate: start } : {}) },
          });
        }
      }
    }
  });

  const updated = await prisma.domainProject.findUnique({
    where: { id },
    include: INCLUDE,
  });
  return NextResponse.json({ project: updated ? serialize(updated) : null });
}

/** Delete a project. Its tasks go with it (cascade); work-log hours are
 *  preserved — only their project/task links go null. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const auth = await authorize(id, user.role);
  if (auth === "notfound") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.domainProject.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}