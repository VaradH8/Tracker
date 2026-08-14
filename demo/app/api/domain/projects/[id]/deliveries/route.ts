import { NextResponse } from "next/server";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { SUPERVISOR_ROLES } from "@/lib/domain";
import { projectDeliveries } from "@/lib/domain-forecast";

/**
 * The delivery record behind one project's forecast: approved tags by day
 * and division, naming the actionee who submitted each count and the Lead
 * who signed it off, plus each division's measured pace.
 *
 * Read-only, and derived entirely from approved submissions — the same
 * source the projected delivery date comes from, so the numbers here and
 * the forecast can never disagree.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  // Matches the Forecast page this backs. It exposes every person's
  // output on the project, which is a manager's view — Team Leads assign
  // work but don't get the cross-team performance picture.
  const forbidden = requireDomainRole(userOrResp, SUPERVISOR_ROLES);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const data = await projectDeliveries(id);
  return NextResponse.json(data);
}
