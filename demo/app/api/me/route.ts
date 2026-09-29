import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server-access";
import { shortName } from "@/lib/short-name";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  return NextResponse.json({
    id: user.id,
    name: user.name,
    shortName: shortName(user.name),
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
  });
}
