import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { USER_SELECT, serializeUser } from "@/lib/api-v1/serialize";

/** Health check: who this token authenticates as. */
export const GET = v1(async (_req, { user }) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: USER_SELECT });
  return NextResponse.json({ ...serializeUser(u), service_account: true });
});
export const DELETE = forbidDelete;
