import type { Client, Project } from "./mock";

/**
 * Reshape Prisma rows into the client-side `Project` / `Client` types the
 * UI already speaks. Keeps the existing components untouched.
 */

type PrismaProject = {
  id: number;
  name: string;
  clientId: number;
  status: string;
  coordinatorName: string;
  bdName: string;
  leadId: string | null;
  lead?: { name: string } | null;
  members?: { user: { name: string } }[];
  startDate: Date;
  targetDate: Date;
  budgetHours: number;
  loggedHours: number;
  progress: number;
  health: string;
  description: string | null;
};

export function serializeProject(p: PrismaProject): Project {
  return {
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    status: p.status as Project["status"],
    coordinator: p.coordinatorName,
    bd: p.bdName,
    lead: p.lead?.name.split(" ")[0],
    teamMembers: (p.members ?? []).map((m) => m.user.name.split(" ")[0]),
    startDate: p.startDate.toISOString().slice(0, 10),
    targetDate: p.targetDate.toISOString().slice(0, 10),
    budgetHours: p.budgetHours,
    loggedHours: p.loggedHours,
    progress: p.progress,
    health: p.health as Project["health"],
    description: p.description ?? undefined,
  };
}

type PrismaClient = {
  id: number;
  name: string;
  industry: string;
  primaryContact: string;
  email: string;
  since: Date;
};

export function serializeClient(c: PrismaClient): Client {
  return {
    id: c.id,
    name: c.name,
    industry: c.industry,
    primaryContact: c.primaryContact,
    email: c.email,
    since: c.since.toISOString().slice(0, 10),
  };
}
