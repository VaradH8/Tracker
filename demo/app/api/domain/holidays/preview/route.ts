import { NextResponse } from "next/server";
import { requireDomainUser } from "@/lib/domain-auth";
import { handoverFrom, isValidISODate, isWorkWeek } from "@/lib/domain-workdays";
import { holidaySet } from "@/lib/domain-schedule";

/**
 * The handover date a set of inputs would produce, without saving
 * anything.
 *
 * It exists so the form can show the answer as it's typed while still
 * computing it the same way the save path does. The alternative — the
 * same arithmetic written twice, once in the browser and once on the
 * server — is how a preview ends up disagreeing with what gets stored,
 * and the number here is quoted to a client.
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;

  const q = new URL(req.url).searchParams;
  const start = String(q.get("start") ?? "").slice(0, 10);
  const total = Number(q.get("days"));
  const week = Number(q.get("week"));

  if (!isValidISODate(start)) {
    return NextResponse.json({ error: "Pick a start date." }, { status: 400 });
  }
  if (!isWorkWeek(week)) {
    return NextResponse.json(
      { error: "Working week must be 5 or 6 days." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(total) || total < 1) {
    return NextResponse.json(
      { error: "Enter how many working days the project needs." },
      { status: 400 },
    );
  }

  const result = handoverFrom(start, total, week, await holidaySet());
  if (!result) {
    return NextResponse.json(
      { error: "Couldn't work out a handover date from those." },
      { status: 400 },
    );
  }

  return NextResponse.json(result);
}
