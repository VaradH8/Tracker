import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";

/**
 * The division catalogue (Electrical, Piping, …). Global by design so the
 * same discipline means the same thing on every project — Leads attach
 * them to a project when they create it.
 */

/** Everyone signed in needs the list to read their own tag assignments. */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;

  const divisions = await prisma.domainDivision.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ divisions });
}

/** Leads and Admins add to the catalogue. */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Division name is required." }, { status: 400 });
  }

  // Case-insensitive reuse: "electrical" should find the existing
  // "Electrical" rather than create a near-duplicate. Compared in JS so the
  // behaviour is identical on SQLite and Postgres.
  const all = await prisma.domainDivision.findMany({ select: { id: true, name: true } });
  const existing = all.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (existing) return NextResponse.json({ division: existing });

  const division = await prisma.domainDivision.create({
    data: { name },
    select: { id: true, name: true },
  });
  return NextResponse.json({ division }, { status: 201 });
}
