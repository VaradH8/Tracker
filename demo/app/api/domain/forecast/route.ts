import { NextResponse } from "next/server";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { projectForecasts, resourceForecast } from "@/lib/domain-forecast";
import { DEFAULT_TAGS_PER_DAY, RATE_HISTORY_DAYS } from "@/lib/forecast";

/**
 * The forecast dashboard, for Leads and Admins: who's available and from
 * when, and where every project stands against its handover date.
 *
 * Everything here is derived on read from approved deliveries — there's no
 * stored forecast to go stale, so an approval made a second ago is already
 * reflected.
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const projectIdParam = url.searchParams.get("projectId");
  const projectId = projectIdParam ? Number(projectIdParam) : undefined;

  const [resources, projects] = await Promise.all([
    resourceForecast(),
    projectForecasts(Number.isFinite(projectId) ? projectId : undefined),
  ]);

  return NextResponse.json({
    resources,
    projects,
    meta: {
      defaultTagsPerDay: DEFAULT_TAGS_PER_DAY,
      rateHistoryDays: RATE_HISTORY_DAYS,
      generatedAt: new Date().toISOString(),
    },
  });
}
