import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  EMPLOYEE_EDITORS,
  normaliseCode,
  parseEmployee,
  serializeEmployee,
} from "@/lib/domain-employee";

const WITH_ACCOUNT = {
  user: { select: { id: true, email: true, role: true } },
} as const;

async function editor() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, EMPLOYEE_EDITORS);
  if (forbidden) return forbidden;
  return userOrResp;
}

/**
 * Amend an employee's details, deactivate them, or attach/detach a login.
 *
 * `isActive: false` is the normal way somebody leaves — the record stays,
 * because HR needs to know who worked here, and their history elsewhere
 * should not develop holes.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const who = await editor();
  if (who instanceof NextResponse) return who;

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "Bad employee id." }, { status: 400 });
  }
  const existing = await prisma.domainEmployee.findUnique({
    where: { id: employeeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  // Detail edits arrive as a whole set, validated together — the same rules
  // that apply on the way in apply to an amendment.
  const touchesDetails =
    body.name !== undefined ||
    body.code !== undefined ||
    body.designation !== undefined ||
    body.department !== undefined ||
    body.email !== undefined ||
    body.phone !== undefined ||
    body.location !== undefined ||
    body.joinedOn !== undefined;

  if (touchesDetails) {
    const parsed = parseEmployee({
      code: body.code ?? existing.code,
      name: body.name ?? existing.name,
      designation: body.designation ?? existing.designation,
      department: body.department ?? existing.department,
      email: body.email ?? existing.email,
      phone: body.phone ?? existing.phone,
      location: body.location ?? existing.location,
      joinedOn:
        body.joinedOn ??
        (existing.joinedOn
          ? existing.joinedOn.toISOString().slice(0, 10)
          : null),
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const wanted = normaliseCode(parsed.value.code);
    const clash = await prisma.domainEmployee.findMany({
      select: { id: true, code: true },
    });
    if (
      clash.some(
        (e) => e.id !== employeeId && normaliseCode(e.code) === wanted,
      )
    ) {
      return NextResponse.json(
        { error: `Employee code "${parsed.value.code}" is already in use.` },
        { status: 400 },
      );
    }
    Object.assign(data, parsed.value);
  }

  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  // Attaching a login: the account must exist and not already belong to
  // another employee. Passing null detaches without touching the account.
  if (body.userId !== undefined) {
    const userId = body.userId === null ? null : String(body.userId);
    if (userId) {
      const account = await prisma.domainUser.findUnique({
        where: { id: userId },
        include: { employee: { select: { id: true } } },
      });
      if (!account) {
        return NextResponse.json(
          { error: "That account doesn't exist." },
          { status: 400 },
        );
      }
      if (account.employee && account.employee.id !== employeeId) {
        return NextResponse.json(
          { error: "That account is already linked to another employee." },
          { status: 400 },
        );
      }
    }
    data.userId = userId;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.domainEmployee.update({
    where: { id: employeeId },
    data,
    include: WITH_ACCOUNT,
  });
  return NextResponse.json({ employee: serializeEmployee(updated) });
}

/**
 * Remove an employee record outright. For somebody who has left, prefer
 * PATCH { isActive: false } — this is for records filed by mistake.
 * Deleting never touches a linked account; the link simply goes.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const who = await editor();
  if (who instanceof NextResponse) return who;

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "Bad employee id." }, { status: 400 });
  }
  const existing = await prisma.domainEmployee.findUnique({
    where: { id: employeeId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.domainEmployee.delete({ where: { id: employeeId } });
  return NextResponse.json({ ok: true });
}
