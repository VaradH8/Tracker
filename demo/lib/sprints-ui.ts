import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/short-name";

/** Sprint as the /sprints page shows it: dates, its tasks, and the
 *  planned-vs-done numbers. Cancelled tasks are listed but leave the plan. */
export const UI_SPRINT_INCLUDE = {
  project: { select: { id: true, name: true, key: true } },
  tasks: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      estimatedHours: true,
      targetDate: true,
      assignees: {
        select: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.SprintInclude;

type Row = Prisma.SprintGetPayload<{ include: typeof UI_SPRINT_INCLUDE }>;

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function serializeUiSprint(s: Row, canManage: boolean) {
  const live = s.tasks.filter((t) => t.status !== "Cancelled" && t.status !== "Hold");
  const done = live.filter((t) => t.status === "Done");
  const hours = (ts: typeof live) => Math.round(ts.reduce((n, t) => n + (t.estimatedHours ?? 0), 0) * 10) / 10;
  return {
    id: s.id,
    projectId: s.projectId,
    projectName: s.project.name,
    name: s.name,
    goal: s.goal ?? "",
    startDate: ymd(s.startDate)!,
    endDate: ymd(s.endDate)!,
    status: s.status,
    canManage,
    plannedTasks: live.length,
    doneTasks: done.length,
    plannedHours: hours(live),
    doneHours: hours(done),
    tasks: s.tasks.map((t) => ({
      id: t.id,
      key: `${s.project.key || `P${s.projectId}`}-${t.id}`,
      title: t.title,
      status: t.status,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
      targetDate: ymd(t.targetDate),
      assignees: t.assignees.map((a) => shortName(a.user.name)),
    })),
  };
}

export type UiSprint = ReturnType<typeof serializeUiSprint>;

export async function loadUiSprint(id: number) {
  return prisma.sprint.findUnique({ where: { id }, include: UI_SPRINT_INCLUDE });
}
