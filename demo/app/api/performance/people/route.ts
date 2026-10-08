import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canDownloadPerformance,
  reportingManagersWhere,
  canEditEmployeeRecord,
  canSeePerformance,
  requireUser,
} from "@/lib/server-access";
import { toISO } from "@/lib/engagement";

/** GET — who can be reviewed (every active non-Admin account; for a
 *  Lead, only their own team), the Admins and Leads who can be their
 *  Reporting Manager, and what the viewer may do. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeePerformance(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const managers = await prisma.user.findMany({
    where: reportingManagersWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true, primaryRole: true },
  });

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      primaryRole: { not: "Admin" },
      ...(me.role === "Lead" ? { reportingManagerId: me.id } : {}),
    },
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
    managers: managers.map((u) => ({ id: u.id, name: u.name, role: u.primaryRole })),
    viewer: {
      id: me.id,
      canEditRecords: canEditEmployeeRecord(me),
      canDownload: canDownloadPerformance(me),
    },
  });
}
