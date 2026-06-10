import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditTasks, requireUser } from "@/lib/server-access";
import { serializePipeline } from "@/lib/serializers";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const deals = await prisma.pipelineDeal.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ deals: deals.map(serializePipeline) });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  if (!canEditTasks(user.role) && user.role !== "BusinessDeveloper") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const deal = await prisma.pipelineDeal.create({
    data: {
      name: String(body.name ?? "").trim() || "Untitled deal",
      clientName: String(body.client ?? "").trim() || "—",
      estimatedValue: Number(body.estimatedValue ?? 0) || 0,
      probability: Number(body.probability ?? 20) || 20,
      stage: String(body.stage ?? "Lead"),
      expectedStart: body.expectedStart
        ? new Date(String(body.expectedStart))
        : null,
      bdName: user.name.split(" ")[0],
    },
  });
  return NextResponse.json({ deal: serializePipeline(deal) });
}

export async function PATCH(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const updated = await prisma.pipelineDeal.update({
    where: { id },
    data: {
      ...(typeof body.stage === "string" ? { stage: body.stage } : {}),
      ...(typeof body.probability === "number"
        ? { probability: body.probability }
        : {}),
      ...(typeof body.estimatedValue === "number"
        ? { estimatedValue: body.estimatedValue }
        : {}),
    },
  });
  return NextResponse.json({ deal: serializePipeline(updated) });
}
