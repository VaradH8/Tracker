import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canDownloadPerformance,
  canEditEmployeeRecord,
  canSeePerformance,
  requireUser,
} from "@/lib/server-access";
import { toISO } from "@/lib/engagement";

/** GET — who can be reviewed (every active non-Admin account), the Leads
 *  who can be their Reporting Manager, and what the viewer may do. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeePerformance(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { isActive: true, primaryRole: { not: "Admin" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      primaryRole: true,
      designation: true,
      department: true,
      employeeCode: true,
      joined: true,
      reportingManagerId: true,
      reportingManager: { select: { name: true } },
    },
  });

  return NextResponse.json({
    people: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.primaryRole,
      designation: u.designation ?? "",
      department: u.department ?? "",
      employeeCode: u.employeeCode ?? "",
      joined: u.joined ? toISO(u.joined) : "",
      reportingManagerId: u.reportingManagerId,
      reportingManager: u.reportingManager?.name ?? "",
    })),
    leads: users
      .filter((u) => u.primaryRole === "Lead")
      .map((u) => ({ id: u.id, name: u.name })),
    viewer: {
      id: me.id,
      canEditRecords: canEditEmployeeRecord(me),
      canDownload: canDownloadPerformance(me),
    },
  });
}
