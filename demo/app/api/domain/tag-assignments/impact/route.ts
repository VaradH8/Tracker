import { NextResponse } from "next/server";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { removalImpact } from "@/lib/domain-tag-removal";

/**
 * What taking this person off this project would cost.
 *
 * Read before the confirmation dialog is drawn, so the warning can state
 * the real figures — "3 batches, 4,857 tags, 4,857 of them delivered, 26
 * submissions" — rather than a generic "are you sure?". A confirmation
 * that cannot say what it is confirming is a speed bump, not a safeguard.
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get("projectId"));
  const assigneeId = url.searchParams.get("assigneeId") ?? "";
  if (!Number.isInteger(projectId) || !assigneeId) {
    return NextResponse.json(
      { error: "Say which person on which project." },
      { status: 400 },
    );
  }

  return NextResponse.json({ impact: await removalImpact(projectId, assigneeId) });
}
