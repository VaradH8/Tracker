import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditTasks, requireUser } from "@/lib/server-access";
import { serializeClient } from "@/lib/serializers";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ clients: clients.map(serializeClient) });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  // Admin, Coord, BD can add clients.
  if (!canEditTasks(user.role) && user.role !== "BusinessDeveloper") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const industry = String(body.industry ?? "—").trim();
  const primaryContact = String(body.primaryContact ?? "—").trim();
  const email = String(body.email ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const created = await prisma.client.create({
    data: {
      name,
      industry: industry || "—",
      primaryContact: primaryContact || "—",
      email,
      since: new Date(),
    },
  });

  return NextResponse.json({ client: serializeClient(created) });
}
