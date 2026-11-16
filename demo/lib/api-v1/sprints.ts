import { prisma } from "@/lib/db";
import type { ApiUser } from "./auth";
import { ApiError, notFound, parseDate } from "./http";
import { SPRINT_INCLUDE, SPRINT_STATUSES, serializeSprint } from "./serialize";
import { rejectForbiddenFields, type Attribution } from "./tasks";

const WRITABLE_SPRINT_FIELDS = new Set(["name", "goal", "status", "start_date", "end_date"]);
const CREATE_FIELDS = new Set([...WRITABLE_SPRINT_FIELDS, "project_id"]);

const invalid = (field: string, message: string) => new ApiError(422, "invalid", message, field);

type SprintPatch = {
  name?: string;
  goal?: string | null;
  status?: string;
  startDate?: Date;
  endDate?: Date;
};

function validate(body: Record<string, unknown>): SprintPatch {
  const p: SprintPatch = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200) {
      throw invalid("name", "name must be a non-empty string (max 200)");
    }
    p.name = body.name.trim();
  }
  if (body.goal !== undefined) {
    if (body.goal !== null && (typeof body.goal !== "string" || body.goal.length > 2000)) {
      throw invalid("goal", "goal must be a string (max 2000) or null");
    }
    p.goal = (body.goal as string | null)?.trim() || null;
  }
  if (body.status !== undefined) {
    const s = typeof body.status === "string" ? body.status.toLowerCase() : "";
    if (!(SPRINT_STATUSES as readonly string[]).includes(s)) {
      throw invalid("status", "status must be planned, active or closed");
    }
    p.status = s;
  }
  for (const [field, key] of [["start_date", "startDate"], ["end_date", "endDate"]] as const) {
    if (body[field] !== undefined) {
      const d = parseDate(body[field]);
      if (!d) throw invalid(field, `${field} must be YYYY-MM-DD`);
      p[key] = d;
    }
  }
  return p;
}

function summary(actor: ApiUser, attr: Attribution, what: string) {
  let s = `${what} — via ${actor.name}`;
  if (attr.onBehalfOfName) s += ` on behalf of ${attr.onBehalfOfName}`;
  if (attr.sourceNote) s += `: ${attr.sourceNote}`;
  return s;
}

export async function createSprint(body: Record<string, unknown>, actor: ApiUser, attr: Attribution) {
  rejectForbiddenFields(body, CREATE_FIELDS);
  for (const f of ["project_id", "name", "start_date", "end_date"]) {
    if (body[f] === undefined || body[f] === null || body[f] === "") {
      throw new ApiError(422, "missing_field", `${f} is required`, f);
    }
  }
  const projectId = Number(body.project_id);
  if (!Number.isInteger(projectId)) throw invalid("project_id", "project_id must be an integer");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!project) throw invalid("project_id", "Unknown project");
  const p = validate(body);
  if (p.endDate! < p.startDate!) throw invalid("end_date", "end_date is before start_date");

  const sprint = await prisma.$transaction(async (tx) => {
    const s = await tx.sprint.create({
      data: {
        projectId,
        name: p.name!,
        goal: p.goal ?? null,
        startDate: p.startDate!,
        endDate: p.endDate!,
        status: p.status ?? "planned",
      },
      include: SPRINT_INCLUDE,
    });
    await tx.auditEntry.create({
      data: {
        actorId: actor.id,
        action: "sprint.create",
        scope: project.name,
        after: summary(actor, attr, `${s.name} (${s.status})`),
      },
    });
    return s;
  });
  return serializeSprint(sprint);
}

export async function updateSprint(
  id: number,
  body: Record<string, unknown>,
  actor: ApiUser,
  attr: Attribution,
) {
  rejectForbiddenFields(body, WRITABLE_SPRINT_FIELDS);
  const existing = await prisma.sprint.findUnique({
    where: { id },
    include: { project: { select: { name: true } } },
  });
  if (!existing) throw notFound("Sprint");
  const p = validate(body);
  const start = p.startDate ?? existing.startDate;
  const end = p.endDate ?? existing.endDate;
  if (end < start) throw invalid("end_date", "end_date is before start_date");

  const changed: string[] = [];
  if (p.name !== undefined && p.name !== existing.name) changed.push(`name: ${existing.name} → ${p.name}`);
  if (p.goal !== undefined && p.goal !== existing.goal) changed.push("goal");
  if (p.status !== undefined && p.status !== existing.status) changed.push(`status: ${existing.status} → ${p.status}`);
  if (p.startDate && +p.startDate !== +existing.startDate) changed.push("start_date");
  if (p.endDate && +p.endDate !== +existing.endDate) changed.push("end_date");

  const sprint = await prisma.$transaction(async (tx) => {
    const s = await tx.sprint.update({ where: { id }, data: p, include: SPRINT_INCLUDE });
    if (changed.length) {
      await tx.auditEntry.create({
        data: {
          actorId: actor.id,
          action: "sprint.update",
          scope: existing.project.name,
          after: summary(actor, attr, `${s.name}: ${changed.join("; ")}`),
        },
      });
    }
    return s;
  });
  return serializeSprint(sprint);
}
