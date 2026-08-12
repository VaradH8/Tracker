import { NextResponse } from "next/server";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { resourceForecast } from "@/lib/domain-forecast";

/**
 * "Is this person busy, and when do they free up?" — answered at the
 * moment of assigning tags, so a Lead isn't handing work to someone
 * already buried.
 *
 * Deliberately separate from /api/domain/forecast: Team Leads assign tags
 * but aren't trusted with the full forecast (project totals, delivery
 * projections), so this exposes only the availability slice they need.
 */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const resources = await resourceForecast();

  return NextResponse.json({
    resources: resources.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      status: r.status,
      availableFrom: r.availableFrom,
      rate: r.effectiveRate,
      usingDefaultRate: r.usingDefaultRate,
      // What they're on now, and how much of it is still outstanding.
      projects: r.projects.map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        startDate: p.startDate,
        endDate: p.releasedAt ?? p.endDate,
        assignedTags: p.assignedTags,
        deliveredTags: p.deliveredTags,
        openTags: Math.max(0, p.assignedTags - p.deliveredTags),
      })),
    })),
  });
}
