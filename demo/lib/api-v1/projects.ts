import { prisma } from "@/lib/db";
import { accessRole } from "@/lib/role-access";
import type { ApiUser } from "./auth";
import { ApiError, parseDate } from "./http";
import { PROJECT_INCLUDE, serializeProject } from "./serialize";
import { rejectForbiddenFields, type Attribution } from "./tasks";

const CREATE_FIELDS = new Set([
  "name",
  "key",
  "client",
  "description",
  "start_date",
  "target_end_date",
  "budget_hours",
  "lead_ids",
  "member_ids",
]);
const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

const invalid = (field: string, message: string) => new ApiError(422, "invalid", message, field);

/** The same people who may create a project in the UI (POST /api/projects):
 *  Admins, Leads, Coordinators (HR counts as one) and Business Developers. */
function canCreateProjects(u: { primaryRole: string; isAdmin: boolean }) {
  if (u.isAdmin) return true;
  return ["Admin", "Lead", "Coordinator", "BusinessDeveloper"].includes(
    accessRole(u.primaryRole as Parameters<typeof accessRole>[0]),
  );
}

async function activePeople(field: string, raw: unknown): Promise<string[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" && typeof x !== "number")) {
    throw invalid(field, `${field} must be an array of user ids`);
  }
  const ids = [...new Set(raw.map(String))];
  if (!ids.length) return [];
  const found = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, isServiceAccount: false },
    select: { id: true },
  });
  const ok = new Set(found.map((u) => u.id));
  const bad = ids.filter((id) => !ok.has(id));
  if (bad.length) throw invalid(field, `Unknown or inactive users: ${bad.join(", ")}`);
  return ids;
}

/**
 * Create a project for the PM Inventive integration.
 *
 * A project decides who sees what, so unlike tasks and sprints it must be
 * created on behalf of a named person who could create it in the UI; the
 * service account alone can't. That person becomes a Lead of the project
 * unless lead_ids names the leads explicitly.
 */
export async function createProject(
  body: Record<string, unknown>,
  actor: Pick<ApiUser, "id" | "name">,
  attr: Attribution,
) {
  rejectForbiddenFields(body, CREATE_FIELDS);
  if (!attr.onBehalfOfUserId) {
    throw new ApiError(
      422,
      "missing_field",
      "on_behalf_of_user_id is required: a project is created for a person",
      "on_behalf_of_user_id",
    );
  }
  const requester = await prisma.user.findUnique({
    where: { id: attr.onBehalfOfUserId },
    select: { primaryRole: true, isAdmin: true, isActive: true },
  });
  if (!requester?.isActive || !canCreateProjects(requester)) {
    throw new ApiError(403, "forbidden", "This person can't create projects", "on_behalf_of_user_id");
  }

  for (const f of ["name", "client", "target_end_date"]) {
    if (body[f] === undefined || body[f] === null || body[f] === "") {
      throw new ApiError(422, "missing_field", `${f} is required`, f);
    }
  }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200) {
    throw invalid("name", "name must be a non-empty string (max 200)");
  }
  const name = body.name.trim();

  let key: string | null = null;
  if (body.key !== undefined && body.key !== null) {
    key = typeof body.key === "string" ? body.key.trim().toUpperCase() : "";
    if (!KEY_RE.test(key)) throw invalid("key", "key must be 2-10 letters or digits, starting with a letter");
    if (await prisma.project.findUnique({ where: { key }, select: { id: true } })) {
      throw new ApiError(409, "conflict", `Project key ${key} is already used`, "key");
    }
  }

  // Clients carry contact details the API doesn't manage, so a project can
  // only be filed under one that already exists.
  const clientName = typeof body.client === "string" ? body.client.trim() : "";
  const client = await prisma.client.findFirst({
    where: { name: { equals: clientName, mode: "insensitive" } },
    select: { id: true },
  });
  if (!client) throw invalid("client", `Unknown client '${clientName}'. Add it in the tracker first.`);

  const startDate = body.start_date === undefined ? new Date() : parseDate(body.start_date);
  if (!startDate) throw invalid("start_date", "start_date must be YYYY-MM-DD");
  const targetDate = parseDate(body.target_end_date);
  if (!targetDate) throw invalid("target_end_date", "target_end_date must be YYYY-MM-DD");
  if (targetDate < startDate) throw invalid("target_end_date", "target_end_date is before start_date");

  let budgetHours = 80;
  if (body.budget_hours !== undefined) {
    const b = Number(body.budget_hours);
    if (!Number.isInteger(b) || b < 0 || b > 100_000) {
      throw invalid("budget_hours", "budget_hours must be a whole number from 0 to 100000");
    }
    budgetHours = b;
  }
  if (body.description !== undefined && body.description !== null &&
      (typeof body.description !== "string" || body.description.length > 5000)) {
    throw invalid("description", "description must be a string (max 5000)");
  }

  const leads = body.lead_ids === undefined
    ? [attr.onBehalfOfUserId]
    : await activePeople("lead_ids", body.lead_ids);
  if (!leads.length) throw invalid("lead_ids", "A project needs at least one lead");
  const developers = (await activePeople("member_ids", body.member_ids)).filter((id) => !leads.includes(id));

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name,
        key,
        clientId: client.id,
        status: "Active",
        startDate,
        targetDate,
        budgetHours,
        description: (body.description as string | null | undefined)?.trim() || null,
        members: {
          create: [
            ...leads.map((userId) => ({ userId, role: "Lead" })),
            ...developers.map((userId) => ({ userId, role: "Developer" })),
          ],
        },
      },
      include: PROJECT_INCLUDE,
    });
    let after = `${p.name} — via ${actor.name} on behalf of ${attr.onBehalfOfName}`;
    if (attr.sourceNote) after += `: ${attr.sourceNote}`;
    await tx.auditEntry.create({
      data: { actorId: actor.id, action: "project.create", scope: p.name, after },
    });
    return p;
  });
  return serializeProject(project);
}
