import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  EMPLOYEE_EDITORS,
  EMPLOYEE_READERS,
  normaliseCode,
  parseEmployee,
  serializeEmployee,
} from "@/lib/domain-employee";

/** The employee register. Supervisors read it; only Admin/Lead change it. */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, EMPLOYEE_READERS);
  if (forbidden) return forbidden;

  const employees = await prisma.domainEmployee.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { user: { select: { id: true, email: true, role: true } } },
  });
  return NextResponse.json({ employees: employees.map(serializeEmployee) });
}

/**
 * File a new employee. No password, no role, no account — this is a person
 * on the payroll, not a login. Attaching credentials later is a separate
 * step against the record created here.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, EMPLOYEE_EDITORS);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const parsed = parseEmployee(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const fields = parsed.value;

  // Uniqueness is checked on the normalised code so "EMP01" and "emp-01"
  // can't become two people. Compared in JS for the same reason the rest of
  // this module does: `mode: "insensitive"` is Postgres-only and throws
  // against the SQLite dev database.
  const wanted = normaliseCode(fields.code);
  const existing = await prisma.domainEmployee.findMany({
    select: { id: true, code: true },
  });
  if (existing.some((e) => normaliseCode(e.code) === wanted)) {
    return NextResponse.json(
      { error: `Employee code "${fields.code}" is already in use.` },
      { status: 400 },
    );
  }

  const created = await prisma.domainEmployee.create({
    data: fields,
    include: { user: { select: { id: true, email: true, role: true } } },
  });
  return NextResponse.json(
    { employee: serializeEmployee(created) },
    { status: 201 },
  );
}
