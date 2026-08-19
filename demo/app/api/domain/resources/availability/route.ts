import { NextResponse } from "next/server";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { resourceForecast } from "@/lib/domain-forecast";
import { PORTFOLIO_VIEWER_ROLES } from "@/lib/domain";

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
  const forbidden = requireDomainRole(userOrResp, PORTFOLIO_VIEWER_ROLES);
  if (forbidden) return forbidden;

  const resources = await resourceForecast();

  return NextResponse.json({
    resources: resources.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.status,
      openTags: r.openTags,
      openTagProjects: r.openTagProjects,
      availableFrom: r.availableFrom,
      // The planning rate, null when nobody has set or earned one. The
      // house default is deliberately not sent: a made-up number shown
      // next to real ones reads as fact.
      rate: r.rate,
      measuredRate: r.measuredRate,
      approvedTags: r.approvedTags,
      measuredDays: r.measuredDays,
      rateSource: r.rateSource,
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
