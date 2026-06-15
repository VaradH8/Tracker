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
  const rawValue = Number(body.estimatedValue ?? 0);
  const rawProb = Number(body.probability ?? 20);
  const deal = await prisma.pipelineDeal.create({
    data: {
      name: String(body.name ?? "").trim() || "Untitled deal",
      clientName: String(body.client ?? "").trim() || "—",
      // Negative estimated values don't make sense; cap at ₹100 cr to
      // catch fat-finger input. Probability is a percentage.
      estimatedValue: Math.max(
        0,
        Math.min(10_000_000_000, Number.isFinite(rawValue) ? rawValue : 0),
      ),
      probability: Math.max(
        0,
        Math.min(100, Number.isFinite(rawProb) ? rawProb : 20),
      ),
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
  const user = userOrResp;
  // Same set that can POST a deal — Admin/Coord/BD. Without this check
  // any Developer can move deals between stages.
  if (!canEditTasks(user.role) && user.role !== "BusinessDeveloper") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
        ? {
            probability: Math.max(0, Math.min(100, body.probability)),
          }
        : {}),
      ...(typeof body.estimatedValue === "number"
        ? {
            estimatedValue: Math.max(
              0,
              Math.min(10_000_000_000, body.estimatedValue),
            ),
          }
        : {}),
    },
  });
  return NextResponse.json({ deal: serializePipeline(updated) });
}
