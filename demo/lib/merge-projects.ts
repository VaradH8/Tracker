/**
 * Planning half of a project merge. Pure — no DB, no IO — so the decision
 * about what moves where can be tested without a database, and the CLI is
 * left with nothing but the writes.
 *
 * Project.name carries no unique constraint, which is how the same project
 * comes to exist twice under different capitalisation ("Enimax" and
 * "ENIMAX"). Renaming one does not fix that: it leaves two rows with the
 * same name. The duplicate has to be emptied of its tasks and deleted.
 *
 * Nothing is lost by moving a task. A task's assignees, remarks,
 * attachments, time entries and dependencies all hang off taskId rather
 * than projectId, so reassigning the project carries every one of them
 * along. Only ProjectMember is keyed on the project and needs merging.
 */

export type ProjectRow = {
  id: number;
  name: string;
  clientId: number;
  /** Tasks currently on this project — decides which row survives when no
   *  name matches the canonical one exactly. */
  taskCount: number;
};

export type MergePlan = {
  /** The project that survives. Null when no candidate was found at all. */
  keep: ProjectRow | null;
  /** Emptied of their tasks, then deleted. */
  absorb: ProjectRow[];
  /** Tasks that will change hands. */
  tasksMoving: number;
  /** True when `keep` has to be renamed to reach the canonical spelling. */
  renameNeeded: boolean;
  /** Candidates sitting under a different client. Moving a project between
   *  clients is a bigger claim than fixing capitalisation, so these are
   *  reported and refused rather than merged silently. */
  crossClient: ProjectRow[];
};

/** Case-, space- and punctuation-insensitive, so "P & ID" and "P&ID" agree. */
export function normaliseName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Projects whose name contains `token`, e.g. every Enimax-like row. */
export function candidatesFor(projects: ProjectRow[], token: string): ProjectRow[] {
  const needle = normaliseName(token);
  if (!needle) return [];
  return projects.filter((p) => normaliseName(p.name).includes(needle));
}

/**
 * Decide the merge.
 *
 * The survivor is the project already spelled canonically; failing that,
 * the one carrying the most tasks — fewest rows move, so the smallest
 * amount of history is disturbed. Ties break on the lowest id, which is
 * the oldest row and the one other things are most likely to reference.
 */
export function planMerge(
  projects: ProjectRow[],
  opts: { canonicalName: string; token: string },
): MergePlan {
  const { canonicalName, token } = opts;
  const candidates = candidatesFor(projects, token);

  if (candidates.length === 0) {
    return {
      keep: null,
      absorb: [],
      tasksMoving: 0,
      renameNeeded: false,
      crossClient: [],
    };
  }

  const canonical = normaliseName(canonicalName);
  const exact = candidates.filter((p) => normaliseName(p.name) === canonical);

  const ranked = [...candidates].sort(
    (a, b) => b.taskCount - a.taskCount || a.id - b.id,
  );
  const keep = exact.length > 0
    ? [...exact].sort((a, b) => b.taskCount - a.taskCount || a.id - b.id)[0]
    : ranked[0];

  // Only rows under the survivor's client are absorbed. A same-named
  // project belonging to a different client is a different engagement, not
  // a typo, and merging it would quietly reassign somebody's work.
  const rest = candidates.filter((p) => p.id !== keep.id);
  const crossClient = rest.filter((p) => p.clientId !== keep.clientId);
  const absorb = rest.filter((p) => p.clientId === keep.clientId);

  return {
    keep,
    absorb,
    tasksMoving: absorb.reduce((n, p) => n + p.taskCount, 0),
    renameNeeded: normaliseName(keep.name) !== canonical || keep.name !== canonicalName,
    crossClient,
  };
}

/** A human-readable plan, printed before anything is written. */
export function describePlan(plan: MergePlan, canonicalName: string): string[] {
  if (!plan.keep) return [`No projects matched — nothing to merge.`];
  const lines: string[] = [];
  lines.push(
    `keep    #${plan.keep.id} "${plan.keep.name}" (${plan.keep.taskCount} tasks)` +
      (plan.renameNeeded ? ` → rename to "${canonicalName}"` : ""),
  );
  for (const p of plan.absorb) {
    lines.push(`absorb  #${p.id} "${p.name}" (${p.taskCount} tasks) → delete once empty`);
  }
  for (const p of plan.crossClient) {
    lines.push(
      `SKIP    #${p.id} "${p.name}" — different client (${p.clientId}); merge it by hand if that is wrong`,
    );
  }
  lines.push(`${plan.tasksMoving} task(s) change project.`);
  return lines;
}
