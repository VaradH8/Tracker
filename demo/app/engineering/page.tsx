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
  // A Team Lead supervises and carries tags. They get the oversight view,
  // with their own work kept below it rather than replaced by it.
  const alsoCarriesWork = current.role === "TeamLead";

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
    status: "On Track" | "Behind Schedule" | "Unknown";
    projectedDate: string | null;
    slackDays: number | null;
  };
};

type PendingRow = { id: number; date: string; completedCount: number };
type ResourceRow = { id: string; status: "Free" | "Allocated" };

function ManagerHome() {
  const [projects, setProjects] = useState<ForecastProject[] | null>(null);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  /** Tasks this person handed out that are now waiting on their decision. */
  const [taskReviews, setTaskReviews] = useState<DomainTask[]>([]);

  useEffect(() => {
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
    ])
      .then(([f, p, t]) => {
        setProjects(f.projects ?? []);
        setResources(f.resources ?? []);
        setPending(p.submissions ?? []);
        setTaskReviews(t.tasks ?? []);
      })
      .catch(() => setProjects([]));
  }, []);

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
    pending.length === 0 && behind.length === 0 && taskReviews.length === 0;

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="font-heading text-lg font-semibold mb-3">
          Needs your attention
        </h2>

        {clear ? (
          <div className="card p-5 flex items-center gap-3">
            <CheckSquare size={18} className="text-brand-greenText shrink-0" />
            <p className="text-sm text-ink-700">
              Nothing waiting — no submissions to review, and every project is on
              track.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Task approvals belong to whoever handed the task out, so
                this card only ever appears for that person. */}
            {taskReviews.length > 0 && (
              <Link
                href="/engineering/task-log"
                className="card p-5 border-l-4 border-brand-blue hover:shadow-md transition block"
              >
                <div className="flex items-center gap-2 text-brand-blue">
                  <CheckSquare size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Tasks awaiting your approval
                  </span>
                </div>
                <div className="font-heading text-3xl font-semibold mt-1 text-ink-900">
                  {taskReviews.length}{" "}
                  <span className="text-lg font-normal text-ink-500">
                    task{taskReviews.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-sm text-ink-600 mt-1">
                  {taskReviews
                    .slice(0, 2)
                    .map((t) => `${t.assignee ?? "Someone"} · ${t.title}`)
                    .join(" · ")}
                  {taskReviews.length > 2 && ` · +${taskReviews.length - 2} more`}
                </p>
                <span className="text-sm text-brand-blue inline-flex items-center gap-1 mt-2">
                  Review now <ArrowRight size={14} />
                </span>
              </Link>
            )}

            {pending.length > 0 && (
              <Link
                href="/engineering/approvals"
                className="card p-5 border-l-4 border-brand-yellow hover:shadow-md transition block"
              >
                <div className="flex items-center gap-2 text-brand-yellowText">
                  <Clock size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Awaiting your approval
                  </span>
                </div>
                <div className="font-heading text-3xl font-semibold mt-1 text-ink-900">
                  {pending.length}{" "}
                  <span className="text-lg font-normal text-ink-500">
                    submission{pending.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-sm text-ink-600 mt-1">
                  <strong>{pendingTags}</strong> tags claimed
                  {oldest && <> · oldest from {fmtDate(oldest)}</>}
                </p>
                <span className="text-sm text-brand-blue inline-flex items-center gap-1 mt-2">
                  Review now <ArrowRight size={14} />
                </span>
              </Link>
            )}

            {behind.length > 0 && (
              <Link
                href="/engineering/forecast"
                className="card p-5 border-l-4 border-brand-red hover:shadow-md transition block"
              >
                <div className="flex items-center gap-2 text-brand-redText">
                  <AlertTriangle size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Behind schedule
                  </span>
                </div>
                <div className="font-heading text-3xl font-semibold mt-1 text-ink-900">
                  {behind.length}{" "}
                  <span className="text-lg font-normal text-ink-500">
                    project{behind.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-sm text-ink-600 mt-1">
                  {behind
                    .map(
                      (p) =>
                        `${p.name} (${Math.abs(p.forecast.slackDays ?? 0)}d late)`,
                    )
                    .join(" · ")}
                </p>
                <span className="text-sm text-brand-blue inline-flex items-center gap-1 mt-2">
                  Open forecast <ArrowRight size={14} />
                </span>
              </Link>
            )}
          </div>
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
function ProjectGroupCard({ g }: { g: ProjectGroup }) {
  const pct = g.assigned > 0 ? (g.delivered / g.assigned) * 100 : 0;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-ink-900">
            {g.projectName}
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {g.client && <>{g.client} · </>}
            {g.allocation ? (
              <>
                You are on this from {fmtDate(g.allocation.startDate)} to{" "}
                {fmtDate(g.allocation.endDate)}
              </>
            ) : (
              <>Tags assigned to you on this project</>
            )}
          </p>
        </div>
        {g.assigned > 0 && (
          <div className="text-right shrink-0">
            <div className="font-heading text-lg font-semibold text-ink-900">
              {g.delivered} / {g.assigned}
            </div>
            <div className="text-xs text-ink-500">tags delivered</div>
          </div>
        )}
      </div>

      {g.assigned > 0 && (
        <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden mt-3">
          <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
        </div>
      )}

      {g.assignments.length === 0 ? (
        // Booked on, nothing handed over yet. Saying so beats an empty card.
        <p className="text-sm text-ink-500 mt-3">
          No tags assigned to you here yet — your Lead will assign them.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[540px]">
            <thead className="text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold pb-2">Division</th>
                <th className="text-right font-semibold pb-2">Delivered</th>
                <th className="text-right font-semibold pb-2 pl-4">Remaining</th>
                <th className="text-left font-semibold pb-2 pl-4">Due</th>
                <th className="text-left font-semibold pb-2 pl-4">Assigned by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {g.assignments.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 text-ink-900 font-medium">
                    {t.divisionName ?? "General"}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <span className="text-brand-greenText font-semibold">
                      {t.deliveredCount}
                    </span>
                    <span className="text-ink-500"> / {t.assignedCount}</span>
                    {t.pendingCount > 0 && (
                      <div className="text-xs text-brand-yellowText inline-flex items-center gap-1">
                        <Clock size={11} /> {t.pendingCount} awaiting approval
                      </div>
                    )}
                  </td>
                  <td className="py-2 pl-4 text-right text-ink-700">
                    {t.remainingCount}
                  </td>
                  <td className="py-2 pl-4 text-ink-700 whitespace-nowrap">
                    {fmtDate(t.targetDate)}
                  </td>
                  <td className="py-2 pl-4 text-ink-700">{t.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 text-sm flex-wrap">
        <Link
          href={`/engineering/projects?project=${g.projectId}`}
          className="text-brand-blue inline-flex items-center gap-1"
        >
          Open project <ArrowRight size={14} />
        </Link>
        {g.remaining > 0 && (
          <Link
            href="/engineering/my-tags"
            className="text-brand-blue inline-flex items-center gap-1 ml-auto"
          >
            Submit a count <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
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
    ])
      .then(([a, al, s, t]) => {
        setRows(a.assignments ?? []);
        setAllocs(al.allocations ?? []);
        setSubs(s.submissions ?? []);
        setTasks(t.tasks ?? []);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  if (rows === null) {
    return secondary ? null : <p className="text-sm text-ink-500">Loading…</p>;
  }

  const groups = groupByProject(allocs, rows);
  if (secondary && groups.length === 0 && tasks.length === 0) return null;

  const assigned = rows.reduce((s, r) => s + r.assignedCount, 0);
  const delivered = rows.reduce((s, r) => s + r.deliveredCount, 0);
  const pending = rows.reduce((s, r) => s + r.pendingCount, 0);
  const remaining = rows.reduce((s, r) => s + r.remainingCount, 0);

  // The last few decisions, so an approval — or a reduced count — doesn't
  // go unnoticed.
  const decided = subs.filter((s) => s.status !== "Pending").slice(0, 5);

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

            <div className="grid gap-4">
              {groups.map((g) => (
                <ProjectGroupCard key={g.projectId} g={g} />
              ))}
            </div>
          </>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="font-heading text-lg font-semibold mb-3">
            Recent decisions
          </h2>
          <div className="card divide-y divide-ink-100">
            {decided.map((s) => {
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
            All my submissions <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* Tasks handed to this person. Submitting happens right here — the
          whole point is that it takes no navigation to say "done". */}
      {tasks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold">
              Tasks assigned to me
            </h2>
            <Link
              href="/engineering/task-log"
              className="text-sm text-brand-blue inline-flex items-center gap-1"
            >
              Open Task log <ArrowRight size={14} />
            </Link>
          </div>
          <DomainTaskList
            tasks={tasks}
            canManage={false}
            viewerId={current?.id}
            viewerRole={current?.role}
            onChanged={load}
          />
        </section>
      )}
    </div>
  );
}
