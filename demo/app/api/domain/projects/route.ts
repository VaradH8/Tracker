import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";

const INCLUDE = {
  owner: { select: { id: true, name: true } },
  _count: { select: { tasks: true } },
} as const;

function serialize(p: {
  id: number;
  name: string;
  description: string | null;
  owner: { id: string; name: string };
  _count: { tasks: number };
  createdAt: Date;
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    owner: p.owner.name,
    ownerId: p.owner.id,
    taskCount: p._count.tasks,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Everyone signed into the domain can see the project list — they need
 *  it to work tasks. */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const projects = await prisma.domainProject.findMany({
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ projects: projects.map(serialize) });
}

/** Lead (project owner) or Admin creates projects. */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const created = await prisma.domainProject.create({
    data: { name, description, ownerId: user.id },
    include: INCLUDE,
  });
  return NextResponse.json({ project: serialize(created) });
}