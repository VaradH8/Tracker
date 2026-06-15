import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireUser,
  visibleProjectIds,
  canEditTasks,
  userByFirstName,
} from "@/lib/server-access";
import { serializeProject } from "@/lib/serializers";

const PROJECT_INCLUDE = {
  client: true,
  members: { include: { user: true } },
  _count: { select: { tasks: true } },
} as const;

const ROLES = ["Lead", "Coordinator", "Developer", "BD"] as const;
type ProjectRole = (typeof ROLES)[number];

async function resolveFirstNamesToIds(names: unknown): Promise<string[]> {
  if (!Array.isArray(names)) return [];
  const ids: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const user = await userByFirstName(raw);
    if (user) ids.push(user.id);
  }
  return Array.from(new Set(ids));
}

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const ids = await visibleProjectIds(user);
  const projects = await prisma.project.findMany({
    where: ids === "all" ? undefined : { id: { in: ids } },
    include: PROJECT_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects: projects.map(serializeProject) });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  if (!canEditTasks(user.role) && user.role !== "BusinessDeveloper") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const clientId = Number(body.clientId);
  const status = String(body.status ?? "Active");
  const startDate = body.startDate
    ? new Date(String(body.startDate))
    : new Date();
  const targetDate = body.targetDate
    ? new Date(String(body.targetDate))
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const budgetHours = Number(body.budgetHours ?? 80);
  const description =
    typeof body.description === "string" ? body.description : null;

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ error: "Pick a client." }, { status: 400 });
  }

  // Resolve per-role rosters from first-name arrays.
  const rosterByRole: Record<ProjectRole, string[]> = {
    Lead: await resolveFirstNamesToIds(body.leads),
    Coordinator: await resolveFirstNamesToIds(body.coordinators),
    Developer: await resolveFirstNamesToIds(body.developers),
    BD: await resolveFirstNamesToIds(body.bds),
  };
  // The creator gets auto-added to the project so they don't lose
  // visibility, tagged in whatever role matches their global role.
  // A BD creating the project shouldn't get a phantom Coordinator
  // tag they didn't earn. Admins get tagged as Coordinator (the
  // closest project-level analogue) for project-page display.
  const creatorRole: ProjectRole =
    user.role === "BusinessDeveloper"
      ? "BD"
      : user.role === "Developer"
        ? "Developer"
        : "Coordinator";
  if (!rosterByRole[creatorRole].includes(user.id)) {
    rosterByRole[creatorRole].push(user.id);
  }

  const memberRows = ROLES.flatMap((role) =>
    rosterByRole[role].map((userId) => ({ userId, role })),
  );

  const created = await prisma.project.create({
    data: {
      name,
      clientId,
      status,
      startDate,
      targetDate,
      budgetHours,
      loggedHours: 0,
      progress: 0,
      health: "green",
      description,
      members: { create: memberRows },
    },
    include: PROJECT_INCLUDE,
  });

  await prisma.auditEntry.create({
    data: {
      actorId: user.id,
      action: "project.create",
      scope: created.name,
    },
  });

  return NextResponse.json({ project: serializeProject(created) });
}
