import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { jsonBody, notFound, routeId } from "@/lib/api-v1/http";
import { SPRINT_INCLUDE, serializeSprint } from "@/lib/api-v1/serialize";
import { updateSprint } from "@/lib/api-v1/sprints";
import { readAttribution } from "@/lib/api-v1/tasks";

export const GET = v1<{ id: string }>(async (_req, { params }) => {
  const s = await prisma.sprint.findUnique({ where: { id: routeId(params.id) }, include: SPRINT_INCLUDE });
  if (!s) throw notFound("Sprint");
  return NextResponse.json(serializeSprint(s));
});

export const PATCH = v1<{ id: string }>(async (req, { params, user }) => {
  const id = routeId(params.id);
  const body = await jsonBody(req);
  const attr = await readAttribution(body);
  return NextResponse.json(await updateSprint(id, body, user, attr));
});

export const DELETE = forbidDelete;
