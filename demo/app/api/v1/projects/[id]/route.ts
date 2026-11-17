import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { notFound, routeId } from "@/lib/api-v1/http";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/api-v1/serialize";

export const GET = v1<{ id: string }>(async (_req, { params }) => {
  const p = await prisma.project.findUnique({
    where: { id: routeId(params.id) },
    include: PROJECT_INCLUDE,
  });
  if (!p) throw notFound("Project");
  return NextResponse.json(serializeProject(p));
});
export const DELETE = forbidDelete;
