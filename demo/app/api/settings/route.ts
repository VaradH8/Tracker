import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, canManageUsers } from "@/lib/server-access";
import {
  getSettings,
  serializeSettings,
  ALL_WEEKDAYS,
} from "@/lib/settings";

/** Anyone signed in can read settings (the leave form needs the types and
 *  working days); only admins can change them. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const s = await getSettings();
  return NextResponse.json({ settings: serializeSettings(s) });
}

export async function PATCH(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.smtpFrom === "string") {
    data.smtpFrom = body.smtpFrom.trim() || null;
  }
  if (Number.isFinite(Number(body.workingHoursPerDay))) {
    data.workingHoursPerDay = Math.min(
      24,
      Math.max(1, Math.round(Number(body.workingHoursPerDay))),
    );
  }
  if (Array.isArray(body.workingDays)) {
    const days = body.workingDays.filter((d: unknown) =>
      ALL_WEEKDAYS.includes(d as (typeof ALL_WEEKDAYS)[number]),
    );
    data.workingDays = days.join(",");
  }
  if (Array.isArray(body.leaveTypes)) {
    const types = Array.from(
      new Set(
        body.leaveTypes
          .map((t: unknown) => String(t).trim())
          .filter((t: string) => t.length > 0),
      ),
    );
    data.leaveTypes = types.join(",");
  }
  if (Number.isFinite(Number(body.annualLeaveQuota))) {
    data.annualLeaveQuota = Math.max(0, Math.round(Number(body.annualLeaveQuota)));
  }

  await getSettings(); // ensure the row exists
  const updated = await prisma.appSettings.update({ where: { id: 1 }, data });
  return NextResponse.json({ settings: serializeSettings(updated) });
}