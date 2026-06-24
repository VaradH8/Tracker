import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";

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

/** Only the project's owner (the Lead who created it) or an Admin may
 *  edit or delete it. */
async function authorize(id: number, userId: string, isAdmin: boolean) {
  const project = await prisma.domainProject.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!project) return "notfound" as const;
  if (!isAdmin && project.ownerId !== userId) return "forbidden" as const;
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
  const auth = await authorize(id, user.id, user.role === "Admin");
  if (auth === "notfound") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null) {
    data.description = body.description ? String(body.description).trim() : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const updated = await prisma.domainProject.update({
    where: { id },
    data,
    include: INCLUDE,
  });
  return NextResponse.json({ project: serialize(updated) });
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
  const auth = await authorize(id, user.id, user.role === "Admin");
  if (auth === "notfound") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.domainProject.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}