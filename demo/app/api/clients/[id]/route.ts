import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canEditTasks,
  canManageUsers,
  requireUser,
} from "@/lib/server-access";
import { serializeClient } from "@/lib/serializers";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  // Admin/Coord/BD can edit a client.
  if (
    !canEditTasks(userOrResp.role) &&
    userOrResp.role !== "BusinessDeveloper"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.industry === "string") data.industry = body.industry.trim();
  if (typeof body.primaryContact === "string") {
    data.primaryContact = body.primaryContact.trim();
  }
  if (typeof body.email === "string") data.email = body.email.trim();
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const updated = await prisma.client.update({ where: { id }, data });
  return NextResponse.json({ client: serializeClient(updated) });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  // Block delete if the client still has projects — the admin should
  // clean those up first to avoid silently orphaning work.
  const projectCount = await prisma.project.count({ where: { clientId: id } });
  if (projectCount > 0) {
    return NextResponse.json(
      {
        error: `This client still has ${projectCount} project(s). Delete or reassign those first.`,
      },
      { status: 409 },
    );
  }
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
