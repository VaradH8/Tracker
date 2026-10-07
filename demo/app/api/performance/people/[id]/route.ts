import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  canEditEmployeeRecord,
  reportingManagerProblem,
  requireUser,
  writeAudit,
} from "@/lib/server-access";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const patchBody = z.object({
  employeeCode: optionalText(40),
  department: optionalText(80),
  designation: optionalText(80),
  joined: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).nullable().optional(),
  reportingManagerId: z.string().nullable().optional(),
});

/** PATCH — HR / Admin maintain the review's employee details: Employee
 *  ID, department, designation, joining date and Reporting Manager (an
 *  Admin or Lead). Fields left out are unchanged; "" or null clears one. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canEditEmployeeRecord(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;

  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = parsed.data;

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const managerProblem = await reportingManagerProblem(b.reportingManagerId, id);
  if (managerProblem) return NextResponse.json({ error: managerProblem }, { status: 400 });

  // undefined = leave alone; "" / null = clear.
  const text = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
  const data = {
    employeeCode: text(b.employeeCode),
    department: text(b.department),
    designation: text(b.designation),
    joined: b.joined === undefined ? undefined : b.joined ? new Date(b.joined + "T00:00:00Z") : null,
    reportingManagerId: b.reportingManagerId === undefined ? undefined : b.reportingManagerId || null,
  };

  if (data.employeeCode) {
    const clash = await prisma.user.findFirst({
      where: { employeeCode: data.employeeCode, NOT: { id } },
      select: { name: true },
    });
    if (clash) {
      return NextResponse.json({ error: `Employee ID already used by ${clash.name}.` }, { status: 409 });
    }
  }

  await prisma.user.update({ where: { id }, data });
  await writeAudit(me.id, "employee.update", {
    scope: "Performance",
    taskTitle: target.name,
    after: JSON.stringify(b),
  });
  return NextResponse.json({ ok: true });
}
