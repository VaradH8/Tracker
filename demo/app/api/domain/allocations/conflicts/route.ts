import { NextResponse } from "next/server";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { SUPERVISOR_ROLES } from "@/lib/domain";
import { allocationConflicts } from "@/lib/domain-forecast";

/**
 * Ask "is this person free over these dates?" without writing anything —
 * lets the allocation form warn as soon as a resource is picked, before
 * the Lead commits to saving.
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, SUPERVISOR_ROLES);
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const start = url.searchParams.get("startDate");
  const end = url.searchParams.get("endDate");
  const excludeParam = url.searchParams.get("excludeProjectId");

  if (!userId || !start || !end) {
    return NextResponse.json(
      { error: "userId, startDate and endDate are all required." },
      { status: 400 },
    );
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Dates must be valid." }, { status: 400 });
  }

  const excludeProjectId = excludeParam ? Number(excludeParam) : undefined;
  const conflicts = await allocationConflicts(
    userId,
    startDate,
    endDate,
    Number.isFinite(excludeProjectId) ? excludeProjectId : undefined,
  );
  return NextResponse.json({ conflicts, hasConflict: conflicts.length > 0 });
}
