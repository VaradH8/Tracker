import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireUser,
  visibleProjectIds,
  canEditTasks,
} from "@/lib/server-access";
import { serializeProject } from "@/lib/serializers";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const ids = await visibleProjectIds(user);
  const projects = await prisma.project.findMany({
    where: ids === "all" ? undefined : { id: { in: ids } },
    include: {
      client: true,
      lead: true,
      members: { include: { user: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects: projects.map(serializeProject) });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  // Admin, Coord, BD can create projects.
  if (!canEditTasks(user.role) && user.role !== "BusinessDeveloper") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const clientId = Number(body.clientId);
  const status = String(body.status ?? "Active");
  const coordinator = String(
    body.coordinator ?? user.name.split(" ")[0],
  ).trim();
  const bd = String(body.bd ?? user.name.split(" ")[0]).trim();
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
    return NextResponse.json(
      { error: "Pick a client." },
      { status: 400 },
    );
  }

  const created = await prisma.project.create({
    data: {
      name,
      clientId,
      status,
      coordinatorName: coordinator,
      bdName: bd,
      startDate,
      targetDate,
      budgetHours,
      loggedHours: 0,
      progress: 0,
      health: "green",
      description,
    },
    include: {
      client: true,
      lead: true,
      members: { include: { user: true } },
      _count: { select: { tasks: true } },
    },
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
