import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { WORKING_ROLES, parseEstimatedHours, type DomainRole } from "@/lib/domain";

const INCLUDE = {
  project: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  startDate: Date | null;
  targetDate: Date | null;
  estimatedHours: number | null;
  createdAt: Date;
  project: { id: number; name: string };
  assignee: { id: string; name: string; role: string } | null;
  createdBy: { id: string; name: string };
};

function serialize(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    targetDate: t.targetDate ? t.targetDate.toISOString().slice(0, 10) : null,
    estimatedHours: t.estimatedHours,
    projectId: t.project.id,
    projectName: t.project.name,
    assignee: t.assignee?.name ?? null,
    assigneeId: t.assignee?.id ?? null,
    createdBy: t.createdBy.name,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const mine = url.searchParams.get("mine") === "true";

  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = Number(projectId);
  // Actionees are scoped to their own tasks unless they ask otherwise;
  // ?mine=true forces "assigned to me" for anyone.
  if (mine || user.role === "Actionee") where.assigneeId = user.id;

  const tasks = await prisma.domainTask.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ tasks: tasks.map(serialize) });
}

/** Team Lead (and Lead/Admin) create + assign tasks to actionees. */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const projectId = Number(body.projectId);
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Pick a project." }, { status: 400 });
  }
  const project = await prisma.domainProject.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  // Validate the assignee is a real, active person who can do work
  // (Actionee or Team Lead — Team Leads log their own work too).
  let assigneeId: string | null = null;
  if (body.assigneeId) {
    const assignee = await prisma.domainUser.findUnique({
      where: { id: String(body.assigneeId) },
    });
    if (!assignee || !assignee.isActive) {
      return NextResponse.json({ error: "Assignee not found." }, { status: 400 });
    }
    if (!WORKING_ROLES.includes(assignee.role as DomainRole)) {
      return NextResponse.json(
        { error: "Tasks can only be assigned to Actionees, SMEs, or Team Leads." },
        { status: 400 },
      );
    }
    assigneeId = assignee.id;
  }

  const created = await prisma.domainTask.create({
    data: {
      title,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      projectId,
      assigneeId,
      createdById: user.id,
      startDate: body.startDate ? new Date(String(body.startDate)) : null,
      targetDate: body.targetDate ? new Date(String(body.targetDate)) : null,
      estimatedHours: parseEstimatedHours(body.estimatedHours),
    },
    include: INCLUDE,
  });
  return NextResponse.json({ task: serialize(created) }, { status: 201 });
}