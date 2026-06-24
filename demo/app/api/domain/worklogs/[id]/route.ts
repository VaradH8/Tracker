import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";

/** Delete a work-log entry. The person who logged it can remove their own
 *  (to fix a mistake); an Admin can remove anyone's. The 8am–10pm window
 *  only governs *creating* entries — corrections via delete are allowed
 *  any time, since you can't use deletion to back-date fake hours. */
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
  const log = await prisma.domainWorkLog.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "Admin" && log.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.domainWorkLog.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}