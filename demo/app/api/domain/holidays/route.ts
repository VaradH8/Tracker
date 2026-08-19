import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import type { DomainRole } from "@/lib/domain";
import { isValidISODate } from "@/lib/domain-workdays";
import { dayToDate } from "@/lib/domain-schedule";

/**
 * Public holidays — the days that push a handover date out beyond the
 * weekend.
 *
 * Readable by anyone signed in: a handover date computed from a holiday
 * list nobody can see is a number people have to take on trust, and the
 * first question anyone asks about a slipped date is which days were
 * counted. Only Admins and Leads can change the list — a Team Lead reads
 * the calendar, they don't set the company's holidays.
 */

const WRITE_ROLES: DomainRole[] = ["Admin", "Lead"];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;

  const rows = await prisma.domainHoliday.findMany({
    orderBy: { date: "asc" },
  });
  return NextResponse.json({
    holidays: rows.map((h) => ({ id: h.id, date: iso(h.date), name: h.name })),
    canEdit: WRITE_ROLES.includes(userOrResp.role),
  });
}

export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, WRITE_ROLES);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const date = String(body.date ?? "").slice(0, 10);
  const name = String(body.name ?? "").trim();

  if (!isValidISODate(date)) {
    return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json(
      { error: "Give the holiday a name." },
      { status: 400 },
    );
  }
  if (name.length > 80) {
    return NextResponse.json(
      { error: "Holiday name is too long (80 characters max)." },
      { status: 400 },
    );
  }

  // The date is unique, so adding one twice is a rename rather than an
  // error — two people filling in the year's calendar shouldn't collide.
  const saved = await prisma.domainHoliday.upsert({
    where: { date: dayToDate(date) },
    update: { name },
    create: { date: dayToDate(date), name },
  });

  return NextResponse.json({
    holiday: { id: saved.id, date: iso(saved.date), name: saved.name },
  });
}

export async function DELETE(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, WRITE_ROLES);
  if (forbidden) return forbidden;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Which holiday?" }, { status: 400 });
  }

  // Already gone is a success: the caller wanted it absent, and it is.
  await prisma.domainHoliday.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
