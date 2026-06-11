import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageUsers, requireUser } from "@/lib/server-access";

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
