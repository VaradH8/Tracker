/**
 * Performance review report — the pure part.
 *
 * Turns one employee's tracker facts for a period (tasks, logged hours,
 * leave, remarks) plus whatever the reviewer saved (PerformanceReview.
 * inputs) into the full Monthly / Yearly form. No Prisma, no React: plain
 * data in, plain data out, unit-tested in __tests__/performance-report.
 * test.ts. lib/performance/load.ts gathers the facts; lib/performance/
 * docx.ts writes the result into the Word template.
 *
 * Two kinds of content:
 *   - Derived: task tables, metrics, evidence, *suggested* ratings and
 *     suggested manager text. Recomputed on every read, so they track
 *     the tracker.
 *   - Entered: anything a reviewer typed. It always wins over the
 *     suggestion. The employee's own voice (self-assessment, employee
 *     ratings) is never generated — it stays blank until entered.
 *
 * Dates are ISO day strings ("YYYY-MM-DD") throughout, like
 * lib/engagement.ts, whose working-day helpers this reuses.
 */

import {
  addDays,
  countWorkingDays,
  fmtDay,
  isWorkingDay,
  maxISO,
  minISO,
} from "../engagement";
import {
  ACHIEVEMENT_ROWS,
  AREAS,
  LEVELS,
  MANAGER_PROMPTS,
  MAX_MANUAL_GOALS,
  SELF_PROMPTS,
  isCommentRecipient,
  levelFor,
  parseRating,
  priorityFor,
  type CommentRecipient,
  type DevPriority,
  type Level,
  type ReviewKind,
} from "./forms";

/* ------------------------------------------------------------------ input */

export type TaskFact = {
  id: number;
  title: string;
  description: string | null;
  projectName: string;
  priority: string;
  status: string;
  important: boolean;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
  completedAt: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  reopenCount: number;
  approved: boolean;
  /** Hours logged on the task by anyone, up to the period's end. */
  logged: number;
  /** Other people sharing the task. */
  coAssignees: number;
};

export type EntryFact = { taskId: number; projectName: string; date: string; hours: number };
export type LeaveFact = { start: string; end: string; type: string };

export type EmployeeFact = {
  id: string;
  name: string;
  employeeCode: string;
  department: string;
  designation: string;
  joined: string | null;
  reportingManager: string;
};

/** A saved monthly review's manager ratings, for the yearly roll-up. */
export type MonthlyRatings = { period: string; ratings: Record<string, number> };

export type ReportFacts = {
  kind: ReviewKind;
  period: string;
  today: string;
  employee: EmployeeFact;
  /** Every task assigned to the employee (filtered to the period here). */
  tasks: TaskFact[];
  /** The employee's time entries inside the period. */
  entries: EntryFact[];
  /** Approved leave overlapping the period. */
  leaves: LeaveFact[];
  /** Remarks the employee wrote inside the period. */
  remarks: number;
  workDays: Set<number>;
  hoursPerDay: number;
  /** Yearly only: saved monthly reviews of that year. */
  monthly?: MonthlyRatings[];
};

export type Inputs = Record<string, string>;

/* ----------------------------------------------------------------- output */

export type RatingRow = {
  key: string;
  label: string;
  evidence: string;
  /** Suggested from tracker data; null where only judgement can rate. */
  system: number | null;
  employee: number | null;
  manager: number | null;
  /** What the form shows: manager's rating, else the suggestion. */
  effective: number | null;
  comments: string;
};

/** A free-text field: what was saved (may be "") and what the tracker
 *  suggests. Shown / exported as `value || suggested`. */
export type TextField = { key: string; label: string; value: string; suggested: string };

export type GoalRow = {
  taskId: number;
  title: string;
  project: string;
  expected: string;
  priority: string;
  targetDate: string | null;
  /** The review form's wording ("Completed", "Delayed", …). */
  status: string;
  /** The tracker's own status as of the period end, as My Tasks shows it
   *  ("To Do", "In Progress", "Blocked", "In review", "Done"). */
  taskStatus: string;
  /** Days past target at the period end, if still open; else null. */
  overdueDays: number | null;
};

export type ProgressStatus = "On Track" | "At Risk" | "Delayed" | "Completed";

export type LongTermRow = {
  taskId: number;
  title: string;
  project: string;
  milestone: TextField;
  planned: number | null;
  actual: number | null;
  status: ProgressStatus;
  taskStatus: string;
  overdueDays: number | null;
};

export type KpiRow = {
  key: string;
  goal: string;
  expected: string;
  actual: string;
  achievement: number | null;
  comments: TextField;
  /** Entered by a reviewer (goal.N.*) rather than computed. */
  manual: boolean;
};

export type Metrics = {
  workingDays: number;
  leaveDays: number;
  unplannedLeaveDays: number;
  leaveByType: Record<string, number>;
  hoursLogged: number;
  capacityHours: number;
  utilization: number | null;
  tasksInScope: number;
  tasksDue: number;
  tasksCompleted: number;
  completionRate: number | null;
  onTimeRate: number | null;
  estimateAccuracy: number | null;
  reworkRate: number | null;
  approvedRate: number | null;
  overdueOpen: number;
  criticalTotal: number;
  criticalDone: number;
  projects: { name: string; hours: number; tasks: number }[];
  remarks: number;
  /** Tasks in scope with no target date or no estimate — evidence gaps. */
  missingTargets: number;
  missingEstimates: number;
};

export type Report = {
  kind: ReviewKind;
  period: string;
  periodLabel: string;
  from: string;
  to: string;
  /** min(to, today): the "as of" day for statuses and progress. */
  asOf: string;
  reviewDate: string;
  employee: EmployeeFact;
  metrics: Metrics;
  goals: GoalRow[];
  longTerm: LongTermRow[];
  kpis: KpiRow[];
  achievements: { key: string; label: string; employee: TextField; manager: TextField }[];
  areas: RatingRow[];
  self: TextField[];
  manager: TextField[];
  summary: {
    overall: number | null;
    overallEntered: boolean;
    /** Shown on the form: the entered choice, else the auto one. */
    level: Level | null;
    /** From the overall rating, ignoring any entered choice. */
    autoLevel: Level | null;
    levelEntered: boolean;
    priority: DevPriority | null;
    autoPriority: DevPriority | null;
    priorityEntered: boolean;
    plan: TextField;
    feedback: TextField;
    employeeComments: TextField;
    /** Who the employee addressed their comments to — routing only, not
     *  part of the printed form. */
    commentTo: CommentRecipient | "";
  };
};

/* ------------------------------------------------------------- periods */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Inclusive [from, to] for a period. Yearly = calendar year. */
export function periodRange(kind: ReviewKind, period: string): { from: string; to: string } {
  if (kind === "Yearly") return { from: `${period}-01-01`, to: `${period}-12-31` };
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

export function periodLabel(kind: ReviewKind, period: string): string {
  if (kind === "Yearly") return period;
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/* ------------------------------------------------------------ helpers */

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rating from a "higher is better" value: ≥c5 → 5, ≥c4 → 4, ≥c3 → 3,
 *  ≥c2 → 2, else 1. Null in, null out. */
export function band(
  v: number | null,
  [c5, c4, c3, c2]: [number, number, number, number],
): number | null {
  if (v == null) return null;
  if (v >= c5) return 5;
  if (v >= c4) return 4;
  if (v >= c3) return 3;
  if (v >= c2) return 2;
  return 1;
}

/** Average of the available signals. A single signal can't award a 5 —
 *  "Exceptional" needs a second one to confirm it. */
function avgRating(vals: (number | null)[]): number | null {
  const xs = vals.filter((v): v is number => v != null);
  if (!xs.length) return null;
  const avg = Math.round(xs.reduce((s, v) => s + v, 0) / xs.length);
  return xs.length === 1 ? Math.min(4, avg) : avg;
}

/** The day a Done task counts as finished. Tasks finished before
 *  completedAt was recorded fall back to their target, then creation. */
export function doneOn(t: TaskFact): string | null {
  if (t.status !== "Done") return null;
  return t.completedAt ?? t.targetDate ?? t.createdAt;
}

function startOf(t: TaskFact): string {
  return t.startDate ?? t.createdAt;
}

/** A task belongs to the period if it had started by the end and wasn't
 *  already finished before the start. */
export function inPeriod(t: TaskFact, from: string, to: string): boolean {
  if (startOf(t) > to) return false;
  const done = doneOn(t);
  return !done || done >= from;
}

/** Status as of `asOf` — a task finished after the period still reads
 *  as open for that period. */
export function statusAsOf(t: TaskFact, asOf: string): string {
  const done = doneOn(t);
  if (done && done <= asOf) return "Completed";
  if (t.targetDate && t.targetDate < asOf) return "Delayed";
  switch (t.status) {
    case "To Do":
      return "Not Started";
    case "In review":
      return "In Review";
    case "Blocked":
      return "Blocked";
    default:
      return "In Progress";
  }
}

/** The tracker status as of `asOf`, in My Tasks' own words. A task
 *  finished after the period was still being worked on at its end. */
export function taskStatusAsOf(t: TaskFact, asOf: string): string {
  const done = doneOn(t);
  if (done && done <= asOf) return "Done";
  return t.status === "Done" ? "In Progress" : t.status;
}

/** Days a still-open task was past its target on `asOf`, else null. */
export function overdueDaysAsOf(t: TaskFact, asOf: string): number | null {
  const done = doneOn(t);
  if (done && done <= asOf) return null;
  if (!t.targetDate || t.targetDate >= asOf) return null;
  return daysBetween(t.targetDate, asOf);
}

/**
 * Does a task in the period belong in "Critical / Long-Term Task
 * Progress"? Critical work (flagged important, or Critical priority), and
 * anything extending beyond the month: started before it, due after it,
 * or already overdue when it began — carried-over work is multi-month by
 * definition, even when the tracker only learned of it recently (an
 * imported task has no start date and a recent creation date).
 */
export function isLongTerm(t: TaskFact, from: string, to: string): boolean {
  if (t.important || /^critical$/i.test(t.priority)) return true;
  if (startOf(t) < from) return true;
  return !!t.targetDate && (t.targetDate < from || t.targetDate > to);
}

/** First meaningful line of the description, minus bullets / dates. */
export function expectedOutcome(description: string | null): string {
  if (!description) return "";
  const line =
    description
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s•*\-–]+/, "").trim())
      .find(Boolean) ?? "";
  const clean = line.replace(/^\d{1,2}-[A-Za-z]{3}-\d{4}\s*\|\s*/, "");
  return clean.length > 160 ? clean.slice(0, 157) + "…" : clean;
}

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function leaveWorkingDays(
  leaves: LeaveFact[],
  from: string,
  to: string,
  workDays: Set<number>,
  filter: (l: LeaveFact) => boolean = () => true,
): number {
  // Count each day once even if two leave rows overlap.
  const days = new Set<string>();
  for (const l of leaves) {
    if (!filter(l)) continue;
    const s = maxISO(l.start, from);
    const e = minISO(l.end, to);
    for (let d = s; d <= e; d = addDays(d, 1)) {
      if (isWorkingDay(d, workDays)) days.add(d);
    }
  }
  return days.size;
}

const isUnplanned = (l: LeaveFact) => /sick|unpaid/i.test(l.type);

function list(titles: string[], max = 6): string {
  const shown = titles.slice(0, max).join("; ");
  return titles.length > max ? `${shown}; +${titles.length - max} more` : shown;
}

/* ------------------------------------------------------------- metrics */

export function computeMetrics(
  f: Pick<ReportFacts, "tasks" | "entries" | "leaves" | "remarks" | "workDays" | "hoursPerDay">,
  from: string,
  to: string,
  asOf: string,
): Metrics {
  const scoped = f.tasks.filter((t) => inPeriod(t, from, to));
  const completed = scoped.filter((t) => {
    const d = doneOn(t);
    return !!d && d >= from && d <= to;
  });
  const due = scoped.filter((t) => t.targetDate && t.targetDate >= from && t.targetDate <= to);
  // Completion: of the work that was due this period or got finished in
  // it, how much is finished.
  const accountable = new Set([...due, ...completed].map((t) => t.id));
  const completedIds = new Set(completed.map((t) => t.id));
  const completedOfAccountable = [...accountable].filter((id) => completedIds.has(id)).length;

  const timed = completed.filter((t) => t.targetDate);
  const onTime = timed.filter((t) => (doneOn(t) ?? "") <= (t.targetDate ?? "")).length;

  let est = 0;
  let act = 0;
  let estimated = 0;
  for (const t of completed) {
    const actual = t.actualHours ?? t.logged;
    if (!t.estimatedHours || !actual) continue;
    est += t.estimatedHours;
    act += actual;
    estimated += 1;
  }
  // 100 = spot on; overruns and big underruns both pull it down.
  const estimateAccuracy =
    estimated > 0 ? Math.round((Math.min(est, act) / Math.max(est, act)) * 100) : null;

  const workingDays = countWorkingDays(from, to, f.workDays);
  const leaveDays = leaveWorkingDays(f.leaves, from, to, f.workDays);
  const unplannedLeaveDays = leaveWorkingDays(f.leaves, from, to, f.workDays, isUnplanned);
  const leaveByType: Record<string, number> = {};
  for (const type of new Set(f.leaves.map((l) => l.type))) {
    const n = leaveWorkingDays(f.leaves, from, to, f.workDays, (l) => l.type === type);
    if (n) leaveByType[type] = n;
  }

  // Capacity only up to today — a month in progress isn't judged on the
  // days that haven't happened yet.
  const elapsedDays = asOf >= from ? countWorkingDays(from, asOf, f.workDays) : 0;
  const elapsedLeave = asOf >= from ? leaveWorkingDays(f.leaves, from, asOf, f.workDays) : 0;
  const capacityHours = round1(Math.max(0, elapsedDays - elapsedLeave) * f.hoursPerDay);
  const hoursLogged = round1(f.entries.reduce((s, e) => s + e.hours, 0));

  const byProject = new Map<string, { hours: number; tasks: Set<number> }>();
  for (const e of f.entries) {
    const p = byProject.get(e.projectName) ?? { hours: 0, tasks: new Set<number>() };
    p.hours += e.hours;
    p.tasks.add(e.taskId);
    byProject.set(e.projectName, p);
  }
  for (const t of completed) {
    const p = byProject.get(t.projectName) ?? { hours: 0, tasks: new Set<number>() };
    p.tasks.add(t.id);
    byProject.set(t.projectName, p);
  }

  const critical = scoped.filter((t) => t.important);
  return {
    workingDays,
    leaveDays,
    unplannedLeaveDays,
    leaveByType,
    hoursLogged,
    capacityHours,
    // No time logged at all reads as "not tracked", not 0% — teams that
    // don't run the timer shouldn't be rated idle.
    utilization:
      capacityHours > 0 && hoursLogged > 0 ? Math.round((hoursLogged / capacityHours) * 100) : null,
    tasksInScope: scoped.length,
    tasksDue: due.length,
    tasksCompleted: completed.length,
    completionRate: pct(completedOfAccountable, accountable.size),
    onTimeRate: pct(onTime, timed.length),
    estimateAccuracy,
    reworkRate: pct(completed.filter((t) => t.reopenCount > 0).length, completed.length),
    approvedRate: pct(completed.filter((t) => t.approved).length, completed.length),
    overdueOpen: scoped.filter((t) => statusAsOf(t, asOf) === "Delayed").length,
    criticalTotal: critical.length,
    criticalDone: critical.filter((t) => completedIds.has(t.id)).length,
    projects: [...byProject.entries()]
      .map(([name, p]) => ({ name, hours: round1(p.hours), tasks: p.tasks.size }))
      .sort((a, b) => b.hours - a.hours || b.tasks - a.tasks),
    remarks: f.remarks,
    missingTargets: scoped.filter((t) => !t.targetDate).length,
    missingEstimates: scoped.filter((t) => !t.estimatedHours).length,
  };
}

/* --------------------------------------------------- suggested ratings */

/**
 * Suggested 1–5 ratings for the areas the tracker can actually measure.
 * A starting point for the Reporting Manager, who can override any of
 * them; areas that need judgement (job knowledge, communication,
 * learning, problem solving) get evidence but no suggestion.
 *
 * Bands, deliberately conservative — "Exceptional" is never awarded on
 * data alone except where a second signal confirms it:
 *   Productivity  avg(utilization band, completion band), 90/75/60/40;
 *                 with only one of the two available, capped at 4
 *   Ownership     avg(on-time band 90/80/65/50, overdue-at-period-end)
 *   Quality       no reopened work → 4; 5 only if ≥80% of it was also
 *                 signed off; ≤10% reopened → 3, ≤25% → 2, else 1
 *   Attendance    unplanned (sick / unpaid) leave days in the month:
 *                 ≤1 → 4, 2 → 3, ≤4 → 2, else 1 (yearly: ×12)
 *   Goal / KPI    average KPI achievement, 100/90/75/50
 */
function suggest(kind: ReviewKind, m: Metrics, kpiAvg: number | null) {
  const productivity = avgRating([
    band(m.utilization, [90, 75, 60, 40]),
    band(m.completionRate, [90, 75, 60, 40]),
  ]);
  const overdueBand =
    m.tasksInScope === 0 ? null : m.overdueOpen === 0 ? 5 : m.overdueOpen === 1 ? 4 : m.overdueOpen === 2 ? 3 : m.overdueOpen <= 4 ? 2 : 1;
  const ownership = avgRating([band(m.onTimeRate, [90, 80, 65, 50]), overdueBand]);
  let quality: number | null = null;
  if (m.tasksCompleted > 0 && m.reworkRate != null) {
    quality =
      m.reworkRate === 0 ? 4 : m.reworkRate <= 10 ? 3 : m.reworkRate <= 25 ? 2 : 1;
    if (m.reworkRate === 0 && (m.approvedRate ?? 0) >= 80) quality = 5;
  }
  const scale = kind === "Yearly" ? 12 : 1;
  const u = m.unplannedLeaveDays / scale;
  const attendance = u <= 1 ? 4 : u <= 2 ? 3 : u <= 4 ? 2 : 1;
  return {
    productivity,
    ownership,
    quality,
    attendance,
    goals: band(kpiAvg, [100, 90, 75, 50]),
  } as Record<string, number | null>;
}

function evidenceFor(key: string, m: Metrics): string {
  const f = (v: number | null, suffix = "%") => (v == null ? "n/a" : `${v}${suffix}`);
  switch (key) {
    case "quality":
      return m.tasksCompleted
        ? `${m.tasksCompleted} task(s) completed; ${f(m.reworkRate)} reopened after Done; ${f(m.approvedRate)} signed off.`
        : "No tasks completed in this period.";
    case "productivity":
      return `${
        m.hoursLogged ? `${m.hoursLogged} h logged of ${m.capacityHours} h available (${f(m.utilization)})` : "No time logged"
      }; ${m.tasksCompleted} completed, ${f(m.completionRate)} of due work done.`;
    case "ownership":
      return `${f(m.onTimeRate)} of completed tasks on/before target; ${m.overdueOpen} overdue at period end.`;
    case "attendance":
      return m.leaveDays
        ? `${m.leaveDays} leave day(s) of ${m.workingDays} working days (${Object.entries(m.leaveByType)
            .map(([t, n]) => `${t} ${n}`)
            .join(", ")}). Punctuality is not tracked — manager to assess.`
        : `No leave in ${m.workingDays} working days. Punctuality is not tracked — manager to assess.`;
    case "knowledge":
      return `Estimate accuracy ${f(m.estimateAccuracy)}; worked across ${m.projects.length} project(s).`;
    case "communication":
      return `${m.remarks} remark(s)/update(s) posted on tasks.`;
    case "learning":
      return `Projects this period: ${list(m.projects.map((p) => p.name), 4) || "none"}.`;
    case "problemSolving":
      return `${m.criticalDone} of ${m.criticalTotal} critical task(s) completed.`;
    case "goals":
      return "Average achievement of the Goals / KPIs in section 2.";
    default:
      return "";
  }
}

/* --------------------------------------------------------------- build */

function text(inputs: Inputs, key: string, label: string, suggested = ""): TextField {
  return { key, label, value: inputs[key] ?? "", suggested };
}

const shown = (t: TextField) => t.value || t.suggested;
export { shown as textOf };

export function buildReport(f: ReportFacts, inputs: Inputs): Report {
  const { kind, period } = f;
  const { from, to } = periodRange(kind, period);
  const asOf = minISO(to, f.today);
  const m = computeMetrics(f, from, to, asOf);
  const scoped = f.tasks.filter((t) => inPeriod(t, from, to));
  const completed = scoped
    .filter((t) => {
      const d = doneOn(t);
      return !!d && d >= from && d <= to;
    })
    .sort((a, b) => Number(b.important) - Number(a.important) || (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  const overdue = scoped.filter((t) => statusAsOf(t, asOf) === "Delayed");

  /* §2 Monthly goals / assigned tasks */
  const goals: GoalRow[] =
    kind === "Monthly"
      ? scoped
          .slice()
          .sort(
            (a, b) =>
              (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
              (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") ||
              a.id - b.id,
          )
          .map((t) => ({
            taskId: t.id,
            title: t.title,
            project: t.projectName,
            expected: expectedOutcome(t.description),
            priority: t.priority,
            targetDate: t.targetDate,
            status: statusAsOf(t, asOf),
            taskStatus: taskStatusAsOf(t, asOf),
            overdueDays: overdueDaysAsOf(t, asOf),
          }))
      : [];

  /* §3 Monthly critical / long-term progress — see isLongTerm. */
  const longTerm: LongTermRow[] =
    kind === "Monthly"
      ? scoped
          .filter((t) => isLongTerm(t, from, to))
          .map((t) => {
            const done = doneOn(t);
            const finished = !!done && done <= asOf;
            const start = startOf(t);
            let planned: number | null = null;
            if (t.targetDate && t.targetDate > start) {
              const span = daysBetween(start, t.targetDate);
              planned = Math.round(Math.min(1, Math.max(0, daysBetween(start, asOf) / span)) * 100);
            } else if (t.targetDate) planned = asOf >= t.targetDate ? 100 : 0;
            const actual = finished
              ? 100
              : t.estimatedHours
                ? Math.min(95, Math.round((t.logged / t.estimatedHours) * 100))
                : null;
            const status: ProgressStatus = finished
              ? "Completed"
              : t.targetDate && t.targetDate < asOf
                ? "Delayed"
                : planned != null && actual != null && planned - actual >= 20
                  ? "At Risk"
                  : "On Track";
            const key = `milestone.${t.id}`;
            return {
              taskId: t.id,
              title: t.title,
              project: t.projectName,
              milestone: text(
                inputs,
                key,
                "Monthly milestone",
                planned != null ? `${planned}% of planned span by ${fmtDay(asOf)}` : "",
              ),
              planned,
              actual,
              status,
              taskStatus: taskStatusAsOf(t, asOf),
              overdueDays: overdueDaysAsOf(t, asOf),
            };
          })
      : [];

  /* §2 Yearly goals / KPIs: tracker KPIs, then manual goals. */
  const kpis: KpiRow[] = [];
  if (kind === "Yearly") {
    const kpi = (key: string, goal: string, expected: string, actual: string, achievement: number | null) =>
      kpis.push({
        key,
        goal,
        expected,
        actual,
        achievement: achievement == null ? null : Math.min(100, achievement),
        comments: text(inputs, `kpi.${key}.comments`, "Manager comments"),
        manual: false,
      });
    const vs = (v: number | null, target: number) => (v == null ? null : Math.round((v / target) * 100));
    kpi("completion", "Task completion rate", "≥ 90% of due work completed", m.completionRate == null ? "n/a" : `${m.completionRate}% (${m.tasksCompleted} completed)`, vs(m.completionRate, 90));
    kpi("onTime", "On-time delivery", "≥ 90% on or before target date", m.onTimeRate == null ? "n/a" : `${m.onTimeRate}%`, vs(m.onTimeRate, 90));
    kpi("utilization", "Utilization of available hours", "≥ 80% of capacity logged", m.utilization == null ? "n/a" : `${m.utilization}% (${m.hoursLogged} h)`, vs(m.utilization, 80));
    kpi("estimate", "Estimate accuracy", "≥ 85% (logged vs estimated)", m.estimateAccuracy == null ? "n/a" : `${m.estimateAccuracy}%`, vs(m.estimateAccuracy, 85));
    if (m.criticalTotal > 0) {
      kpi("critical", "Critical tasks delivered", `All ${m.criticalTotal} critical task(s)`, `${m.criticalDone} of ${m.criticalTotal}`, pct(m.criticalDone, m.criticalTotal));
    }
    for (let n = 1; n <= MAX_MANUAL_GOALS; n++) {
      const goal = inputs[`goal.${n}.goal`];
      if (!goal) continue;
      const a = Number(inputs[`goal.${n}.achievement`]);
      kpis.push({
        key: `goal.${n}`,
        goal,
        expected: inputs[`goal.${n}.expected`] ?? "",
        actual: inputs[`goal.${n}.actual`] ?? "",
        achievement: Number.isFinite(a) && inputs[`goal.${n}.achievement`] ? Math.max(0, Math.min(100, Math.round(a))) : null,
        comments: text(inputs, `goal.${n}.comments`, "Manager comments"),
        manual: true,
      });
    }
  }
  const kpiVals = kpis.map((k) => k.achievement).filter((v): v is number => v != null);
  const kpiAvg = kpiVals.length ? kpiVals.reduce((s, v) => s + v, 0) / kpiVals.length : null;

  /* §4 Ratings */
  const sys = suggest(kind, m, kpiAvg);
  // Yearly: where monthly reviews rated the same area, their average is
  // the better suggestion — it's human judgement across the year.
  const monthlyAvg: Record<string, { avg: number; n: number }> = {};
  for (const mr of f.monthly ?? []) {
    for (const [k, v] of Object.entries(mr.ratings)) {
      const a = monthlyAvg[k] ?? { avg: 0, n: 0 };
      a.avg = (a.avg * a.n + v) / (a.n + 1);
      a.n += 1;
      monthlyAvg[k] = a;
    }
  }
  const areas: RatingRow[] = AREAS[kind].map(({ key, label }) => {
    let system = sys[key] ?? null;
    let evidence = evidenceFor(key, m);
    const mo = kind === "Yearly" ? monthlyAvg[key] : undefined;
    if (mo) {
      system = Math.round(mo.avg);
      evidence += ` Monthly reviews: avg ${round1(mo.avg)} over ${mo.n} month(s).`;
    }
    const employee = parseRating(inputs[`rating.${key}.employee`]);
    const manager = parseRating(inputs[`rating.${key}.manager`]);
    return {
      key,
      label,
      evidence,
      system,
      employee,
      manager,
      effective: manager ?? system,
      comments: inputs[`rating.${key}.comments`] ?? "",
    };
  });

  /* Yearly §3 achievements */
  const projectsLine = list(
    m.projects.map((p) => `${p.name} (${p.hours} h, ${p.tasks} task${p.tasks === 1 ? "" : "s"})`),
    5,
  );
  const critical = completed.filter((t) => t.important).map((t) => t.title);
  const achievements =
    kind === "Yearly"
      ? ACHIEVEMENT_ROWS.map(({ key, label }) => {
          const suggestion =
            key === "achievements"
              ? `${m.tasksCompleted} task(s) completed${critical.length ? `, incl. critical: ${list(critical, 4)}` : ""}; ${m.hoursLogged} h logged.`
              : key === "projects"
                ? projectsLine
                : key === "team"
                  ? `Contributed to ${m.projects.length} project(s); ${m.remarks} task update(s)/remark(s); ${scoped.filter((t) => t.coAssignees > 0).length} shared task(s).`
                  : "";
          return {
            key,
            label,
            employee: text(inputs, `ach.${key}.employee`, "Employee summary"),
            manager: text(inputs, `ach.${key}.manager`, "Manager assessment / evidence", suggestion),
          };
        })
      : [];

  /* §5 Self-assessment — the employee's own words; never generated. */
  const self = SELF_PROMPTS[kind].map(({ key, label }) => text(inputs, `self.${key}`, label));

  /* §6 Manager assessment — suggested from the evidence. */
  const strengths: string[] = [];
  if (m.tasksCompleted && (m.onTimeRate ?? 0) >= 90) strengths.push(`Delivers on time (${m.onTimeRate}% on target)`);
  if ((m.utilization ?? 0) >= 85) strengths.push(`High output (${m.utilization}% of available hours logged)`);
  if (m.tasksCompleted >= 3 && m.reworkRate === 0) strengths.push("No completed work reopened");
  if (m.criticalDone > 0) strengths.push(`Closed ${m.criticalDone} critical task(s)`);
  if ((m.estimateAccuracy ?? 0) >= 85) strengths.push(`Reliable estimates (${m.estimateAccuracy}% accuracy)`);

  const improvements: string[] = [];
  if (overdue.length) improvements.push(`${overdue.length} task(s) overdue at period end: ${list(overdue.map((t) => t.title), 4)}`);
  if (m.onTimeRate != null && m.onTimeRate < 75) improvements.push(`On-time delivery at ${m.onTimeRate}%`);
  if (m.utilization != null && m.utilization < 60) improvements.push(`Logged hours at ${m.utilization}% of capacity — log time daily`);
  if (!m.hoursLogged && m.tasksInScope) improvements.push("No time logged on tasks — use the task timer so effort is visible");
  if ((m.reworkRate ?? 0) > 10) improvements.push(`${m.reworkRate}% of completed work was reopened`);
  if (m.missingTargets || m.missingEstimates)
    improvements.push(
      `Planning data incomplete: ${m.missingTargets} task(s) without target date, ${m.missingEstimates} without estimate`,
    );

  const nextFrom = addDays(to, 1);
  const nextTo = kind === "Monthly" ? periodRange("Monthly", nextFrom.slice(0, 7)).to : addDays(nextFrom, 364);
  const upcoming = f.tasks
    .filter((t) => !doneOn(t) || (doneOn(t) ?? "") > to)
    .filter((t) => !t.targetDate || t.targetDate <= nextTo)
    .sort((a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"))
    .map((t) => (t.targetDate ? `${t.title} (due ${fmtDay(t.targetDate)})` : t.title));

  const monthlyTrend = (f.monthly ?? [])
    .map((mr) => {
      const vals = Object.values(mr.ratings);
      return vals.length
        ? `${MONTHS[Number(mr.period.slice(5, 7)) - 1].slice(0, 3)} ${round1(vals.reduce((s, v) => s + v, 0) / vals.length)}`
        : null;
    })
    .filter(Boolean);
  const completedByMonth = MONTHS.map((name, i) => {
    const mm = `${period}-${String(i + 1).padStart(2, "0")}`;
    return `${name.slice(0, 3)} ${completed.filter((t) => (doneOn(t) ?? "").startsWith(mm)).length}`;
  });

  const managerSuggest: Record<string, string> =
    kind === "Monthly"
      ? {
          achievements: m.tasksCompleted
            ? `Completed ${m.tasksCompleted} task(s): ${list(completed.map((t) => t.title))}`
            : "No tasks completed this month.",
          strengths: strengths.join("; "),
          improvement: improvements.join("; "),
          training: "",
          nextGoals: upcoming.length ? `Close: ${list(upcoming)}` : "",
        }
      : {
          contribution: `${m.tasksCompleted} task(s) completed (${m.criticalDone} critical) across ${m.projects.length} project(s); ${m.hoursLogged} h logged.`,
          consistency: monthlyTrend.length
            ? `Monthly review ratings: ${monthlyTrend.join(" · ")}`
            : `Tasks completed per month: ${completedByMonth.join(" · ")}`,
          strengths: strengths.join("; "),
          development: improvements.join("; "),
          training: "",
          expectations: "",
        };
  const manager = MANAGER_PROMPTS[kind].map(({ key, label }) =>
    text(inputs, `mgr.${key}`, label, managerSuggest[key] ?? ""),
  );

  /* §7 Summary */
  const enteredOverall = parseRating(inputs["summary.overall"], true);
  const rated = areas.map((a) => a.effective).filter((v): v is number => v != null);
  const overall =
    enteredOverall ?? (rated.length ? round1(rated.reduce((s, v) => s + v, 0) / rated.length) : null);
  const enteredLevel = (LEVELS as readonly string[]).includes(inputs["summary.level"] ?? "")
    ? (inputs["summary.level"] as Level)
    : null;
  const enteredPriority = ["Low", "Moderate", "High"].includes(inputs["summary.priority"] ?? "")
    ? (inputs["summary.priority"] as DevPriority)
    : null;

  const reviewDate = /^\d{4}-\d{2}-\d{2}$/.test(inputs.reviewDate ?? "") ? inputs.reviewDate : f.today;

  return {
    kind,
    period,
    periodLabel: periodLabel(kind, period),
    from,
    to,
    asOf,
    reviewDate,
    employee: f.employee,
    metrics: m,
    goals,
    longTerm,
    kpis,
    achievements,
    areas,
    self,
    manager,
    summary: {
      overall,
      overallEntered: enteredOverall != null,
      level: enteredLevel ?? levelFor(overall),
      autoLevel: levelFor(overall),
      levelEntered: enteredLevel != null,
      priority: kind === "Yearly" ? (enteredPriority ?? priorityFor(overall)) : null,
      autoPriority: kind === "Yearly" ? priorityFor(overall) : null,
      priorityEntered: kind === "Yearly" && enteredPriority != null,
      plan: text(
        inputs,
        "summary.plan",
        kind === "Monthly" ? "Action / Improvement Plan" : "Recommended Focus for Next Year",
        improvements.length ? improvements.map((s) => s.split(":")[0]).join("; ") : "",
      ),
      feedback: text(inputs, "summary.feedback", "Manager Final Feedback"),
      employeeComments: text(
        inputs,
        "summary.employeeComments",
        kind === "Monthly" ? "Employee Comments" : "Employee Final Comments",
      ),
      commentTo: isCommentRecipient(inputs["summary.commentTo"]) ? inputs["summary.commentTo"] : "",
    },
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86_400_000,
  );
}

/* ------------------------------------------------------- employee view */

/**
 * What the employee sees on My Performance: their tracker data and the
 * evidence for each area, plus the fields they fill in themselves. The
 * manager's ratings and comments, the suggested ratings and the overall
 * summary are left out, so the self-rating is the employee's own view
 * rather than an echo of the manager's.
 */
export type SelfView = Pick<
  Report,
  "kind" | "period" | "periodLabel" | "from" | "to" | "asOf" | "employee" | "metrics" | "goals" | "self"
> & {
  longTerm: (Omit<LongTermRow, "milestone"> & { milestone: string })[];
  kpis: Omit<KpiRow, "comments">[];
  achievements: { key: string; label: string; employee: TextField }[];
  areas: { key: string; label: string; evidence: string; employee: number | null }[];
  employeeComments: TextField;
  commentTo: CommentRecipient | "";
};

export function toSelfView(r: Report): SelfView {
  return {
    kind: r.kind,
    period: r.period,
    periodLabel: r.periodLabel,
    from: r.from,
    to: r.to,
    asOf: r.asOf,
    employee: r.employee,
    metrics: r.metrics,
    goals: r.goals,
    // The agreed milestone is the target the employee works to — shown.
    longTerm: r.longTerm.map(({ milestone, ...l }) => ({ ...l, milestone: shown(milestone) })),
    kpis: r.kpis.map(({ comments: _comments, ...k }) => k),
    achievements: r.achievements.map(({ key, label, employee }) => ({ key, label, employee })),
    areas: r.areas.map(({ key, label, evidence, employee }) => ({ key, label, evidence, employee })),
    self: r.self,
    employeeComments: r.summary.employeeComments,
    commentTo: r.summary.commentTo,
  };
}
