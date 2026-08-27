"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import { SUPERVISOR_ROLES } from "@/lib/domain";
import { DomainTaskList, type DomainTask } from "@/components/DomainTaskList";
import { DomainTasksCard } from "@/components/DomainTasksCard";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainExecutiveHome } from "@/components/DomainExecutiveHome";
import { fmtDate } from "@/lib/domain-format";

/**
 * The Domain home, answering one question per role:
 *   Lead / Admin  — what needs me today, and is anything slipping?
 *   Everyone else — what do I owe, and what happened to what I sent?
 *
 * This was a page of navigation links with no data on it. Every number
 * here is now real and clicks through to the screen that acts on it.
 */
export default function DomainDashboard() {
  const { current } = useDomain();
  if (!current) return null;

  const isExecutive = current.role === "CEO";
  const isSupervisor = SUPERVISOR_ROLES.includes(current.role);
  /**
   * Leads and Team Leads both supervise and carry work. They get the
   * oversight view with their own below it, rather than instead of it.
   *
   * A Lead used to get oversight only, so a task somebody handed them —
   * and, since Leads may take tags themselves, tags they were carrying —
   * appeared nowhere on their dashboard. The one role able to assign work
   * to itself was the one role that could not see it.
   */
  const alsoCarriesWork =
    current.role === "TeamLead" || current.role === "Lead";

  return (
    <DomainPage width="wide">
      <PageHeader
        title={`Hi ${current.name.split(" ")[0]}`}
        description={
          isExecutive
            ? "Where the portfolio stands, what is slipping, and who is free."
            : isSupervisor
              ? "Where your projects stand, and what's waiting on you."
              : "What you're carrying, and what your Lead decided on what you sent."
        }
      />
      {/* A CEO gets oversight and nothing to action — see
          components/DomainExecutiveHome. */}
      {isExecutive ? (
        <DomainExecutiveHome />
      ) : isSupervisor ? (
        <ManagerHome />
      ) : (
        <WorkerHome />
      )}
      {alsoCarriesWork && (
        <div className="mt-6">
          <WorkerHome secondary />
        </div>
      )}
    </DomainPage>
  );
}


/**
 * One thing that needs doing: how many, what it is, and enough detail to
 * decide whether to act now — on a single line.
 *
 * The count leads because it is what decides urgency; the detail trails
 * in lighter type because it only matters once you have decided to look.
 * The whole row is the link, so there is no "Review now" to hunt for.
 */
function AttentionRow({
  href,
  tone,
  icon,
  count,
  unit,
  label,
  detail,
  more = 0,
}: {
  href: string;
  tone: "blue" | "yellow" | "red";
  icon: React.ReactNode;
  count: number;
  unit: string;
  label: string;
  detail?: string;
  more?: number;
}) {
  const colour =
    tone === "red"
      ? "text-brand-redText"
      : tone === "yellow"
        ? "text-brand-yellowText"
        : "text-brand-blue";
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 py-3 -mx-2 px-2 rounded hover:bg-ink-50 group"
      >
        <span className={`shrink-0 ${colour}`}>{icon}</span>
        <span className="shrink-0">
          <strong className="font-heading text-xl font-semibold text-ink-900">
            {count}
          </strong>{" "}
          <span className="text-sm text-ink-700">
            {unit} {label}
          </span>
        </span>
        {detail && (
          <span className="text-xs text-ink-500 truncate min-w-0">
            {detail}
            {more > 0 && ` · +${more} more`}
          </span>
        )}
        <ArrowRight
          size={14}
          className="ml-auto shrink-0 text-ink-300 group-hover:text-brand-blue"
        />
      </Link>
    </li>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-xs text-ink-500 font-medium uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`font-heading text-3xl font-semibold mt-1 ${tone ?? "text-ink-900"}`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card p-5 hover:shadow-md transition block">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Lead / Admin                                                        */
/* ------------------------------------------------------------------ */

type ForecastProject = {
  id: number;
  name: string;
  client?: string | null;
  handoverDate: string | null;
  totalTags: number;
  deliveredTags: number;
  remainingTags: number;
  peopleEngaged: number;
  forecast: {
    status: "On Track" | "Behind Schedule" | "Yet to be started" | "Unknown";
    projectedDate: string | null;
    slackDays: number | null;
  };
};

type PendingRow = { id: number; date: string; completedCount: number };
type ResourceRow = { id: string; status: "Free" | "Allocated" };

function ManagerHome() {
  const { current } = useDomain();
  const [projects, setProjects] = useState<ForecastProject[] | null>(null);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  /** Tasks this person handed out that are now waiting on their decision. */
  const [taskReviews, setTaskReviews] = useState<DomainTask[]>([]);
  /** Tasks somebody handed to THEM and that are still open. A supervisor
   *  gets given work too, and it was reaching neither list. */
  const [myTasks, setMyTasks] = useState<DomainTask[]>([]);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/domain/forecast", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { projects: [], resources: [] },
      ),
      fetch("/api/domain/tag-submissions?status=Pending", {
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : { submissions: [] })),
      fetch("/api/domain/tasks?review=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { tasks: [] },
      ),
      // Only what is still outstanding — an approved task is history, and
      // this list is about what is waiting on them.
      fetch("/api/domain/tasks?mine=true&open=true", { cache: "no-store" }).then(
        (r) => (r.ok ? r.json() : { tasks: [] }),
      ),
    ])
      .then(([f, p, t, m]) => {
        setProjects(f.projects ?? []);
        setResources(f.resources ?? []);
        setPending(p.submissions ?? []);
        setTaskReviews(t.tasks ?? []);
        setMyTasks(m.tasks ?? []);
      })
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (projects === null) return <p className="text-sm text-ink-500">Loading…</p>;

  const behind = projects.filter((p) => p.forecast.status === "Behind Schedule");
  const pendingTags = pending.reduce((s, x) => s + x.completedCount, 0);
  const oldest = pending.reduce<string | null>(
    (min, x) => (min === null || x.date < min ? x.date : min),
    null,
  );
  const free = resources.filter((r) => r.status === "Free").length;
  const delivered = projects.reduce((s, p) => s + p.deliveredTags, 0);
  const remaining = projects.reduce((s, p) => s + p.remainingTags, 0);
  const total = projects.reduce((s, p) => s + p.totalTags, 0);
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const clear =
    pending.length === 0 &&
    behind.length === 0 &&
    taskReviews.length === 0 &&
    myTasks.length === 0;

  return (
    <div className="grid gap-6">
      {/* ---- needs your attention ----------------------------------
          One row per thing, not three large cards.

          Each card carried an uppercase eyebrow, a 3xl number, a
          sentence and its own "Review now" link — so three items filled
          a screen and the eye had to travel through four type sizes to
          learn three facts. A row says the same thing in one line, and
          the whole list can be taken in at a glance, which is the point
          of a section called "needs your attention".                   */}
      <section className="card p-5">
        <h2 className="font-heading text-lg font-semibold mb-1">
          Needs your attention
        </h2>

        {clear ? (
          <p className="text-sm text-ink-600 flex items-center gap-2 mt-2">
            <CheckSquare size={16} className="text-brand-greenText shrink-0" />
            Nothing waiting — no tasks assigned to you, no submissions to
            review, and every project is on track.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100 -mb-1">
            {/* Work handed TO them, first: it is the only row on this list
                that nobody else can pick up. The row jumps to the list
                further down this page, where it can be acted on. */}
            {myTasks.length > 0 && (
              <AttentionRow
                href="/engineering/task-log"
                tone="blue"
                icon={<CheckSquare size={15} />}
                count={myTasks.length}
                unit={`task${myTasks.length === 1 ? "" : "s"}`}
                label="assigned to you"
                detail={myTasks
                  .slice(0, 2)
                  .map(
                    (t) =>
                      `${t.title}${t.createdBy ? ` — from ${t.createdBy}` : ""}`,
                  )
                  .join("  ·  ")}
                more={myTasks.length > 2 ? myTasks.length - 2 : 0}
              />
            )}

            {taskReviews.length > 0 && (
              <AttentionRow
                href="/engineering/task-log?tab=approve"
                tone="blue"
                icon={<CheckSquare size={15} />}
                count={taskReviews.length}
                unit={`task${taskReviews.length === 1 ? "" : "s"}`}
                label="awaiting your approval"
                detail={taskReviews
                  .slice(0, 2)
                  .map((t) => `${t.assignee ?? "Someone"} · ${t.title}`)
                  .join("  ·  ")}
                more={taskReviews.length > 2 ? taskReviews.length - 2 : 0}
              />
            )}

            {pending.length > 0 && (
              <AttentionRow
                href="/engineering/approvals"
                tone="yellow"
                icon={<Clock size={15} />}
                count={pending.length}
                unit={`submission${pending.length === 1 ? "" : "s"}`}
                label="awaiting your approval"
                detail={`${pendingTags} tags claimed${oldest ? ` · oldest ${fmtDate(oldest)}` : ""}`}
              />
            )}

            {behind.length > 0 && (
              <AttentionRow
                href="/engineering/forecast"
                tone="red"
                icon={<AlertTriangle size={15} />}
                count={behind.length}
                unit={`project${behind.length === 1 ? "" : "s"}`}
                label="behind schedule"
                detail={behind
                  .slice(0, 3)
                  .map(
                    (x) =>
                      `${x.name} (${Math.abs(x.forecast.slackDays ?? 0)}d late)`,
                  )
                  .join("  ·  ")}
                more={behind.length > 3 ? behind.length - 3 : 0}
              />
            )}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-heading text-lg font-semibold mb-3">
          Delivery at a glance
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label="Projects"
            value={projects.length}
            sub={`${behind.length} behind schedule`}
            href="/engineering/projects"
          />
          <Stat
            label="Tags delivered"
            value={delivered}
            sub={`${pct}% of ${total}`}
            tone="text-brand-greenText"
            href="/engineering/forecast"
          />
          <Stat label="Remaining" value={remaining} sub="still to deliver" />
          <Stat
            label="Free resources"
            value={free}
            sub={`of ${resources.length} people`}
            href="/engineering/availability"
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-lg font-semibold">Your projects</h2>
          <Link
            href="/engineering/forecast"
            className="text-sm text-brand-blue inline-flex items-center gap-1"
          >
            <TrendingUp size={14} /> Full forecast
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-500">
              No projects yet.{" "}
              <Link href="/engineering/projects" className="text-brand-blue">
                Create the first one
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Project</th>
                  <th className="text-left font-semibold px-4 py-2">Status</th>
                  <th className="text-right font-semibold px-4 py-2">Delivered</th>
                  <th className="text-left font-semibold px-4 py-2 w-40">
                    Progress
                  </th>
                  <th className="text-left font-semibold px-4 py-2">Projected</th>
                  <th className="text-left font-semibold px-4 py-2">Handover</th>
                  <th className="text-right font-semibold px-4 py-2">People</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {projects
                  .slice()
                  // Worst slack first — the row that needs a decision.
                  .sort(
                    (a, b) =>
                      (a.forecast.slackDays ?? Number.POSITIVE_INFINITY) -
                      (b.forecast.slackDays ?? Number.POSITIVE_INFINITY),
                  )
                  .map((p) => {
                    const pp =
                      p.totalTags > 0 ? (p.deliveredTags / p.totalTags) * 100 : 0;
                    const late = p.forecast.status === "Behind Schedule";
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-2">
                          <Link
                            href={`/engineering/projects?project=${p.id}`}
                            className="font-medium text-ink-900 hover:text-brand-blue"
                          >
                            {p.name}
                          </Link>
                          {p.client && (
                            <div className="text-xs text-ink-500">{p.client}</div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-0.5 rounded-pill text-xs font-medium ${
                              late
                                ? "bg-brand-redBg text-brand-redText"
                                : p.forecast.status === "On Track"
                                  ? "bg-brand-greenBg text-brand-greenText"
                                  : "bg-ink-100 text-ink-500"
                            }`}
                          >
                            {p.forecast.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <span className="text-brand-greenText font-semibold">
                            {p.deliveredTags}
                          </span>
                          <span className="text-ink-500"> / {p.totalTags}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden">
                            <div
                              className="h-full bg-brand-green"
                              style={{ width: `${pp}%` }}
                            />
                          </div>
                        </td>
                        <td
                          className={`px-4 py-2 whitespace-nowrap ${late ? "text-brand-redText font-medium" : "text-ink-700"}`}
                        >
                          {fmtDate(p.forecast.projectedDate)}
                        </td>
                        <td className="px-4 py-2 text-ink-700 whitespace-nowrap">
                          {fmtDate(p.handoverDate)}
                        </td>
                        <td className="px-4 py-2 text-right text-ink-700">
                          {p.peopleEngaged}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DomainTasksCard
        assigned={myTasks.length}
        toApprove={taskReviews.length}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team Lead / SME / Actionee                                          */
/* ------------------------------------------------------------------ */

type MyAssignment = {
  id: number;
  projectId: number;
  projectName: string;
  client: string | null;
  divisionName: string | null;
  assignedCount: number;
  deliveredCount: number;
  remainingCount: number;
  pendingCount: number;
  targetDate: string | null;
  /** The Lead or Admin who handed this work over. */
  createdBy: string;
};

/**
 * A booking onto a project. Held separately from the tags because a Lead
 * allocates people to a project first and assigns the tag counts after —
 * sometimes days later. Until now that gap left a member staring at
 * "nothing assigned to you", with no idea they were even on the project.
 */
type MyAllocation = {
  id: number;
  projectId: number;
  projectName: string;
  client: string | null;
  startDate: string;
  endDate: string;
  releasedAt: string | null;
  expectedTagsPerDay: number | null;
};

/** One project a member is on, with everything they hold inside it. */
type ProjectGroup = {
  projectId: number;
  projectName: string;
  client: string | null;
  allocation: MyAllocation | null;
  assignments: MyAssignment[];
  assigned: number;
  delivered: number;
  remaining: number;
  pending: number;
};

/**
 * Merge the two sources into one list of projects. A project shows up if
 * the member is booked onto it, or holds tags on it, or both — so neither
 * half of a half-finished setup can hide the work from them.
 */
function groupByProject(
  allocations: MyAllocation[],
  assignments: MyAssignment[],
): ProjectGroup[] {
  const m = new Map<number, ProjectGroup>();
  const at = (id: number, name: string, client: string | null) => {
    const g = m.get(id) ?? {
      projectId: id,
      projectName: name,
      client,
      allocation: null,
      assignments: [],
      assigned: 0,
      delivered: 0,
      remaining: 0,
      pending: 0,
    };
    m.set(id, g);
    return g;
  };

  // Released bookings are history, not current work.
  for (const a of allocations.filter((x) => x.releasedAt === null)) {
    at(a.projectId, a.projectName, a.client).allocation = a;
  }
  for (const t of assignments) {
    const g = at(t.projectId, t.projectName, t.client);
    g.assignments.push(t);
    g.assigned += t.assignedCount;
    g.delivered += t.deliveredCount;
    g.remaining += t.remainingCount;
    g.pending += t.pendingCount;
  }

  // Most work left first — what to open this morning.
  return Array.from(m.values()).sort((a, b) => b.remaining - a.remaining);
}

type MySubmission = {
  id: number;
  date: string;
  completedCount: number;
  approvedCount: number | null;
  status: string;
  projectName: string;
  divisionName: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
};

/**
 * One project a member is on. The project is the heading and the tags sit
 * inside it, because "what am I on, and what do I owe on it" is one
 * question — the old flat list of assignment cards split the same project
 * across several cards whenever the work spanned divisions.
 */
/**
 * One project, one line.
 *
 * This used to be a full card per project, carrying a division-by-division
 * table of delivered, remaining, due date and who assigned it. All of that
 * already exists on My tags, in a screen built for reading it, with
 * filters. Printing it a second time on the dashboard turned "what am I
 * working on" into three screens of scrolling, and every completed project
 * sat there in full at 14000/14000 saying nothing anybody needed.
 *
 * What survives is what a dashboard is for: which projects, how far along,
 * and anything actually waiting on somebody. The detail is one click away
 * and says so.
 */
function ProjectGroupCard({ g }: { g: ProjectGroup }) {
  const pct = g.assigned > 0 ? (g.delivered / g.assigned) * 100 : 0;
  const done = g.assigned > 0 && g.remaining === 0 && g.pending === 0;

  return (
    <Link
      href={`/engineering/projects?project=${g.projectId}`}
      className="card px-4 py-3 flex items-center gap-4 hover:bg-ink-50 transition"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-ink-900 truncate">
            {g.projectName}
          </span>
          {done && (
            <span className="px-1.5 py-0.5 rounded-pill text-[10px] font-semibold bg-brand-greenBg text-brand-greenText">
              done
            </span>
          )}
        </span>
        {/* Only what the figures on the right cannot say. A project you are
            booked on but hold nothing for is worth a word; a project
            ticking along is not. */}
        {g.assigned === 0 ? (
          <span className="block text-xs text-ink-500 mt-0.5">
            Nothing assigned to you here yet.
          </span>
        ) : g.pending > 0 ? (
          <span className="block text-xs text-brand-yellowText mt-0.5">
            <Clock size={11} className="inline" /> {g.pending} waiting on your
            Lead
          </span>
        ) : (
          <span className="block text-xs text-ink-500 mt-0.5 truncate">
            {g.client ?? ""}
          </span>
        )}
      </span>

      {g.assigned > 0 && (
        <>
          <span className="hidden sm:block w-28 shrink-0">
            <span className="block h-1.5 rounded-pill bg-ink-100 overflow-hidden">
              <span
                className="block h-full bg-brand-green rounded-pill"
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
          <span className="text-right shrink-0 tabular-nums">
            <span className="block text-sm font-semibold text-ink-900">
              {g.delivered} / {g.assigned}
            </span>
            <span className="block text-[11px] text-ink-500">delivered</span>
          </span>
        </>
      )}

      <ArrowRight size={14} className="shrink-0 text-ink-400" />
    </Link>
  );
}

/**
 * `secondary` renders this underneath a supervisor's own dashboard — the
 * Team Lead case. It drops the stats strip and stays silent when the
 * person happens to be carrying nothing, so a Team Lead with no tags of
 * their own doesn't get an empty "you have no projects" card under a
 * dashboard that is plainly full of projects.
 */
function WorkerHome({ secondary = false }: { secondary?: boolean }) {
  const { current } = useDomain();
  const [rows, setRows] = useState<MyAssignment[] | null>(null);
  const [allocs, setAllocs] = useState<MyAllocation[]>([]);
  const [subs, setSubs] = useState<MySubmission[]>([]);
  const [tasks, setTasks] = useState<DomainTask[]>([]);
  /** An Actionee or SME can be named a reviewer now, so they get an
   *  approval queue like anybody else. It is usually empty. */
  const [reviews, setReviews] = useState<DomainTask[]>([]);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/domain/tag-assignments?mine=true", { cache: "no-store" }).then(
        (r) => (r.ok ? r.json() : { assignments: [] }),
      ),
      fetch("/api/domain/allocations?mine=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { allocations: [] },
      ),
      fetch("/api/domain/tag-submissions?mine=true", { cache: "no-store" }).then(
        (r) => (r.ok ? r.json() : { submissions: [] }),
      ),
      // Only what still needs doing — an approved task is history, and
      // the dashboard is about what's outstanding.
      fetch("/api/domain/tasks?mine=true&open=true", { cache: "no-store" }).then(
        (r) => (r.ok ? r.json() : { tasks: [] }),
      ),
      fetch("/api/domain/tasks?review=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { tasks: [] },
      ),
    ])
      .then(([a, al, s, t, rv]) => {
        setRows(a.assignments ?? []);
        setAllocs(al.allocations ?? []);
        setSubs(s.submissions ?? []);
        setTasks(t.tasks ?? []);
        setReviews(rv.tasks ?? []);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  if (rows === null) {
    return secondary ? null : <p className="text-sm text-ink-500">Loading…</p>;
  }

  const groups = groupByProject(allocs, rows);
  if (
    secondary &&
    groups.length === 0 &&
    tasks.length === 0 &&
    reviews.length === 0
  ) {
    return null;
  }

  const assigned = rows.reduce((s, r) => s + r.assignedCount, 0);
  const delivered = rows.reduce((s, r) => s + r.deliveredCount, 0);
  const pending = rows.reduce((s, r) => s + r.pendingCount, 0);
  const remaining = rows.reduce((s, r) => s + r.remainingCount, 0);

  /**
   * Only decisions that went against them.
   *
   * This was the last five decisions of any kind, which on a working week
   * is five rows of "Approved, 24 of 24" — the same history My tags
   * already lists, in a screen built for reading it. A plain approval is
   * not news; being sent back, or approved for less than you claimed, is,
   * and it is the only part anybody has to do something about.
   */
  const needsAttention = subs
    .filter(
      (s) =>
        s.status === "Rejected" ||
        (s.status === "Approved" &&
          s.approvedCount !== null &&
          s.approvedCount < s.completedCount),
    )
    .slice(0, 4);

  return (
    <div className="grid gap-6">
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-heading text-lg font-semibold">
            {secondary ? "My own work" : "My projects"}
          </h2>
          {rows.length > 0 && (
            <Link href="/engineering/my-tags" className="btn-primary inline-flex">
              Submit today&apos;s count
            </Link>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-500">
              You are not on any project yet. Once a Lead adds you to one it
              appears here, along with the tags they assign you.
            </p>
          </div>
        ) : (
          <>
            {rows.length > 0 && !secondary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <Stat label="Assigned to me" value={assigned} />
                <Stat
                  label="Delivered"
                  value={delivered}
                  tone="text-brand-greenText"
                />
                <Stat
                  label="Awaiting approval"
                  value={pending}
                  tone={pending > 0 ? "text-brand-yellowText" : "text-ink-400"}
                />
                <Stat label="Remaining" value={remaining} />
              </div>
            )}

            {/* Tighter than the old gap-4 grid of full cards: these are
                rows now, and rows want to sit close enough to scan. */}
            <div className="grid gap-2">
              {groups.map((g) => (
                <ProjectGroupCard key={g.projectId} g={g} />
              ))}
            </div>
          </>
        )}
      </section>

      {needsAttention.length > 0 && (
        <section>
          <h2 className="font-heading text-lg font-semibold mb-3">
            Sent back or reduced
          </h2>
          <div className="card divide-y divide-ink-100">
            {needsAttention.map((s) => {
              const reduced =
                s.status === "Approved" &&
                s.approvedCount !== null &&
                s.approvedCount < s.completedCount;
              return (
                <div
                  key={s.id}
                  className="px-5 py-3 flex items-start justify-between gap-4 flex-wrap"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink-900">
                      {s.projectName}
                      {s.divisionName && (
                        <span className="text-ink-500"> · {s.divisionName}</span>
                      )}
                      <span className="text-ink-500"> · {fmtDate(s.date)}</span>
                    </div>
                    {s.reviewNote && (
                      <p className="text-xs text-ink-600 mt-0.5">
                        &ldquo;{s.reviewNote}&rdquo;
                        {s.reviewedBy && (
                          <span className="text-ink-400"> — {s.reviewedBy}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-pill text-xs font-medium ${
                        s.status === "Approved"
                          ? "bg-brand-greenBg text-brand-greenText"
                          : "bg-brand-redBg text-brand-redText"
                      }`}
                    >
                      {s.status}
                    </span>
                    <div className="text-xs text-ink-500 mt-1">
                      {s.approvedCount ?? 0} of {s.completedCount} claimed
                      {reduced && (
                        <span className="text-brand-yellowText"> · reduced</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Link
            href="/engineering/my-tags"
            className="text-sm text-brand-blue inline-flex items-center gap-1 mt-2"
          >
            Everything you have submitted <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* Not when embedded under a supervisor's dashboard — that view has
          already shown this card, and two of them a screen apart invites
          the reader to think they are counting different things. */}
      {!secondary && (
        <DomainTasksCard assigned={tasks.length} toApprove={reviews.length} />
      )}
    </div>
  );
}
