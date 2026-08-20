"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import {
  DOMAIN_ROLE_LABELS,
  canAssignTasks,
  type DomainRole,
} from "@/lib/domain";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  CreateProjectForm,
  EditProjectForm,
  TagAssignmentPanel,
} from "@/components/DomainProjectForecast";
import { DomainProjectResources } from "@/components/DomainProjectResources";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { projectScope, SCOPE_LABELS } from "@/lib/domain-scope";
import { fmtDate as fmtDay } from "@/lib/domain-format";

type Project = {
  id: number;
  name: string;
  description: string | null;
  owner: string;
  ownerId: string;
  taskCount: number;
  startDate?: string | null;
  handoverDate?: string | null;
  totalTags?: number;
  contractTags?: number | null;
  client?: string | null;
  divisions?: { id: number; name: string; totalTags: number }[];
  resources?: {
    allocationId: number;
    id: string;
    name: string;
    role?: string;
    startDate: string;
    endDate: string;
    releasedAt: string | null;
    expectedTagsPerDay: number | null;
  }[];
  assignedTags?: number;
  deliveredTags?: number;
  peopleEngaged?: number;
};

type Person = { id: string; name: string; role: string };

type AssignmentRow = {
  id: number;
  assigneeId: string;
  assigneeName: string;
  divisionId: number | null;
  divisionName: string | null;
  assignedCount: number;
  deliveredCount: number;
  pendingCount: number;
  startDate: string | null;
  targetDate: string | null;
};

export default function DomainProjectsPage() {
  const { current } = useDomain();
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [query, setQuery] = useState("");

  const canCreateProject =
    current?.role === "Admin" || current?.role === "Lead";
  /** The API narrows the list for these two — see GET /api/domain/projects.
   *  Mirrored here only so an empty list says the right thing. */
  const onlyOwnProjects =
    current?.role === "SME" || current?.role === "Actionee";
  // Who may hand out tasks, and to whom, both come from one hierarchy —
  // see assignableRoles. An Admin can task a Lead; a Team Lead can task
  // SMEs and Actionees; nobody can task a peer or themselves.
  const canAssign = current ? canAssignTasks(current.role) : false;

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/domain/projects", { cache: "no-store" });
    if (res.ok) setProjects((await res.json()).projects ?? []);
  }, []);

  // Held here rather than inside the tags panel: the project header needs
  // the same totals, and one fetch beats two.
  const loadAssignments = useCallback(async () => {
    if (selected == null) {
      setAssignments([]);
      return;
    }
    const res = await fetch(`/api/domain/tag-assignments?projectId=${selected}`, {
      cache: "no-store",
    });
    setAssignments(res.ok ? ((await res.json()).assignments ?? []) : []);
  }, [selected]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    void loadProjects();
    fetch("/api/domain/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) => setPeople(b.users ?? []))
      .catch(() => null);
  }, [loadProjects]);

  // Deep link: /domain/projects?project=12 opens that project directly, so a
  // card on the dashboard can land you on the right board. Read from
  // location rather than useSearchParams to avoid needing a Suspense
  // boundary around the whole page.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("project"));
    if (Number.isFinite(id) && id > 0) setSelected(id);
  }, []);


  const selectedProject =
    selected == null ? null : (projects.find((p) => p.id === selected) ?? null);

  // ------------------------------------------------------------------
  // Detail: one project, full width. The list is a step back, not a rail
  // beside it — the app already has a sidebar, and a second one alongside
  // squeezed everything into a narrow column.
  // ------------------------------------------------------------------
  if (selectedProject) {
    const canManageProject =
      current?.role === "Admin" || current?.role === "Lead";
    return (
      <DomainPage width="wide">
        <button
          onClick={() => {
            setSelected(null);
            setEditingProject(null);
          }}
          className="text-sm text-brand-blue inline-flex items-center gap-1 mb-3"
        >
          <ChevronLeft size={14} /> All projects
        </button>

        <ProjectHeader
          project={selectedProject}
          assignments={assignments}
          ownRowsOnly={onlyOwnProjects}
          canManage={canManageProject}
          onEdit={() => setEditingProject(selectedProject.id)}
          onDeleted={() => {
            setSelected(null);
            setEditingProject(null);
            void loadProjects();
          }}
        />
        {editingProject === selectedProject.id && (
          <EditProjectForm
            project={selectedProject}
            people={people}
            onCancel={() => setEditingProject(null)}
            onSaved={() => {
              setEditingProject(null);
              void loadProjects();
            }}
          />
        )}
        {/*
          What an SME or an Actionee gets is a different screen, not the
          same screen with buttons removed. They need two things: who else
          is on this with them, and what they themselves are carrying. The
          division rollup and the per-person allocation breakdown are a
          planner's tools, and the rollup is actively misleading for them
          anyway — the API only ever hands them their own assignment rows,
          so the "by division" totals would show their share as the
          project's whole.
        */}
        {onlyOwnProjects ? (
          <>
            <ProjectRoster resources={selectedProject.resources ?? []} />
            <MyTagsOnProject
              rows={assignments.filter((r) => r.assigneeId === current?.id)}
            />
          </>
        ) : (
          <>
            {/* Tags first, then who is on it.
                The scope of the work is the thing anybody opening a
                project came to read; the booking table is how you act on
                it once you have. Staffing above scope put the answer to
                "how big is this?" below a table of dates and rates. */}
            <TagAssignmentPanel
              project={selectedProject}
              people={people}
              canAssign={canAssign}
              rows={assignments}
              onChanged={() => {
                void loadAssignments();
                void loadProjects();
              }}
            />
            <DomainProjectResources
              projectId={selectedProject.id}
              projectStart={selectedProject.startDate ?? null}
              projectEnd={selectedProject.handoverDate ?? null}
              resources={selectedProject.resources ?? []}
              people={people}
              canManage={canManageProject}
              onChanged={() => {
                void loadProjects();
                void loadAssignments();
              }}
            />
          </>
        )}
      </DomainPage>
    );
  }

  // ------------------------------------------------------------------
  // Index: every project as a card you can read at a glance.
  // ------------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const shown = projects.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.client ?? "").toLowerCase().includes(q),
  );

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Projects"
        description={
          canAssign
            ? "Open a project to set its scope, assign tags and track delivery."
            : "Open a project to see the work you're carrying on it."
        }
        actions={
          canCreateProject ? (
            <button onClick={() => setCreating((v) => !v)} className="btn-primary">
              <Plus size={16} className="mr-1.5" /> New project
            </button>
          ) : null
        }
      />

      {creating && (
        <CreateProjectForm
          people={people}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void loadProjects();
          }}
        />
      )}

      {projects.length > 4 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a project or client"
          className="px-3 py-1.5 rounded border border-ink-200 text-sm w-72 mb-4"
        />
      )}

      {projects.length === 0 ? (
        <div className="card p-10 text-center">
          {/* An SME or Actionee only ever sees the projects they are on, so
              an empty list means "none of yours", not "none at all".
              Saying the latter would have them reporting the module as
              broken. */}
          <p className="text-sm text-ink-500">
            {onlyOwnProjects ? (
              <>
                You&apos;re not on any projects yet. One will appear here as
                soon as you&apos;re given tags or a task on it.
              </>
            ) : (
              <>
                No projects yet.
                {canCreateProject && " Create the first one to start tracking tags."}
              </>
            )}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-400 italic">Nothing matches that search.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((p) => (
            <ProjectCard key={p.id} p={p} onOpen={() => setSelected(p.id)} />
          ))}
        </div>
      )}

    </DomainPage>
  );
}

/**
 * Who is on this project — the read-only half of the allocation table.
 *
 * Names, roles and the window they are booked for. No rates, no source
 * column, no combined throughput: those are planning figures, and a
 * colleague's expected tags a day is not an SME's business.
 */
function ProjectRoster({ resources }: { resources: NonNullable<Project["resources"]> }) {
  return (
    <section className="card p-5 mb-5">
      <h3 className="font-heading text-lg font-semibold text-ink-900">
        Who&apos;s on this project
      </h3>
      <p className="text-sm text-ink-500 mt-0.5 mb-4">
        {resources.length === 0
          ? "Nobody is booked on this project yet."
          : `${resources.length} ${resources.length === 1 ? "person" : "people"} booked.`}
      </p>
      {resources.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-2">
          {resources.map((r) => (
            <li
              key={r.allocationId}
              className="rounded-card border border-ink-200 px-4 py-3"
            >
              <div className="text-ink-900 font-medium">{r.name}</div>
              <div className="text-xs text-ink-500">
                {DOMAIN_ROLE_LABELS[r.role as DomainRole] ?? r.role}
                {" · "}
                {fmtDay(r.startDate)} → {fmtDay(r.releasedAt ?? r.endDate)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The one thing a worker opened the project for: their own tags on it.
 *
 * Same numbers as the My tags page, in the place they are standing.
 */
function MyTagsOnProject({ rows }: { rows: AssignmentRow[] }) {
  const assigned = rows.reduce((s, r) => s + r.assignedCount, 0);
  const delivered = rows.reduce((s, r) => s + r.deliveredCount, 0);
  const pending = rows.reduce((s, r) => s + r.pendingCount, 0);

  return (
    <section className="card p-5 mb-5">
      <h3 className="font-heading text-lg font-semibold text-ink-900">
        Your tags on this project
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-400 italic mt-2">
          You haven&apos;t been given any tags on this project yet.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-500 mt-0.5 mb-4">
            <strong className="text-brand-greenText">{delivered}</strong> of{" "}
            {assigned} delivered
            {pending > 0 && (
              <span className="text-brand-yellowText">
                {" · "}
                {pending} waiting to be approved
              </span>
            )}
          </p>
          <ul className="divide-y divide-ink-100">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm flex-wrap"
              >
                <span className="text-ink-900 font-medium">
                  {r.divisionName ?? "No division"}
                  {(r.startDate || r.targetDate) && (
                    <span className="text-ink-500 font-normal">
                      {" · "}
                      {fmtDay(r.startDate)} → {fmtDay(r.targetDate)}
                    </span>
                  )}
                </span>
                <span className="text-ink-700">
                  <strong className="text-brand-greenText">
                    {r.deliveredCount}
                  </strong>{" "}
                  / {r.assignedCount}
                  {r.pendingCount > 0 && (
                    <span className="text-brand-yellowText">
                      {" "}
                      (+{r.pendingCount})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** One project on the index: scope, progress and dates at a glance. */
function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const scope = projectScope({
    contractTags: p.contractTags ?? null,
    totalTags: p.totalTags ?? 0,
    deliveredTags: p.deliveredTags ?? 0,
  });
  const total = p.totalTags || p.assignedTags || 0;
  const delivered = p.deliveredTags ?? 0;
  const pct = total > 0 ? (delivered / total) * 100 : 0;
  const unassigned = Math.max(0, (p.totalTags ?? 0) - (p.assignedTags ?? 0));

  return (
    <button
      onClick={onOpen}
      className="card p-5 text-left hover:shadow-md transition flex flex-col"
    >
      <div className="min-w-0">
        <h3 className="font-heading font-semibold text-ink-900 truncate">
          {p.name}
        </h3>
        <p className="text-xs text-ink-500 mt-0.5 truncate">
          {p.client ? `${p.client} · ` : ""}Owner {p.owner}
        </p>
      </div>

      {total > 0 ? (
        <>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="font-heading text-2xl font-semibold text-brand-greenText">
              {delivered}
            </span>
            <span className="text-sm text-ink-500">of {total} tags</span>
            <span className="ml-auto text-sm font-medium text-ink-700">
              {Math.round(pct)}%
            </span>
          </div>
          <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden mt-2">
            <div
              className="h-full bg-brand-green"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-400 italic mt-4">No tags set up yet</p>
      )}

      {/* The client position, when this project tracks a contract.
          Silent otherwise — a project without one should not sprout an
          empty row. */}
      {scope.withClientTags !== null && (
        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
          <span className="text-ink-500">
            {SCOPE_LABELS.contract}{" "}
            <strong className="text-ink-900 tabular-nums">
              {scope.contractTags}
            </strong>
          </span>
          <span className="text-brand-yellowText">
            {SCOPE_LABELS.withClient}{" "}
            <strong className="tabular-nums">{scope.withClientTags}</strong>
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 text-xs text-ink-500 flex-wrap">
        {p.handoverDate && <span>Handover {fmtDay(p.handoverDate)}</span>}
        {(p.peopleEngaged ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users size={11} /> {p.peopleEngaged}
          </span>
        )}
        {(p.divisions?.length ?? 0) > 0 && (
          <span>{p.divisions!.length} divisions</span>
        )}
      </div>

      {unassigned > 0 && (
        <p className="text-xs text-brand-yellowText mt-2">
          {unassigned} tags not yet assigned
        </p>
      )}

      {/* mt-auto pins this to the bottom of the card. With a fixed margin it
          floated up on cards that lack the "not yet assigned" line, so the
          Open links didn't line up across the row. */}
      <span className="text-sm text-brand-blue inline-flex items-center gap-1 mt-auto pt-4">
        Open <ChevronRight size={14} />
      </span>
    </button>
  );
}


function ProjectHeader({
  project,
  assignments,
  ownRowsOnly,
  canManage,
  onEdit,
  onDeleted,
}: {
  project: Project;
  assignments: AssignmentRow[];
  /** True when `assignments` holds only the caller's own rows — see the
   *  tag-assignments route, which narrows for SMEs and Actionees. */
  ownRowsOnly: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  async function remove() {
    const res = await fetch(`/api/domain/projects/${project.id}`, {
      method: "DELETE",
    });
    if (res.ok) onDeleted();
  }

  /**
   * Project-wide figures come from the list endpoint, never from summing
   * the assignment rows on this page.
   *
   * Two reasons, and they bit in turn. An SME is only handed their own
   * rows, so summing printed one person's five delivered tags under a
   * heading that says the project's. And the rows are live work only — a
   * removed person's batches are not among them — so summing also wiped
   * their delivered tags off the header the moment they left, which is not
   * what removing somebody means.
   *
   * Pending is the exception: it has no project-wide equivalent on the
   * list endpoint, so it is summed here and hidden when the rows are
   * partial.
   */
  const assigned = project.assignedTags ?? 0;
  const delivered = project.deliveredTags ?? 0;
  const pending = ownRowsOnly
    ? null
    : assignments.reduce((s, r) => s + r.pendingCount, 0);
  const total = project.totalTags || assigned;
  const remaining = Math.max(0, total - delivered);
  const pct = total > 0 ? (delivered / total) * 100 : 0;
  /**
   * Rolled up here rather than in the tags panel, which used to own it.
   * The panel is collapsed by default now, and a project's division split
   * is not something you should have to open anything to see.
   */
  /**
   * Per-division delivery, summed from the live assignment rows this page
   * holds. A removed person's batches are not among them, so the split can
   * come out short of the project total above.
   *
   * `deliveredElsewhere` is exactly that difference, named rather than
   * hidden — it reads as a fact about people who have left, instead of as
   * an arithmetic error nobody can account for.
   */
  const divisions = (project.divisions ?? []).map((d) => {
    const forDiv = assignments.filter((r) => r.divisionId === d.id);
    return {
      id: d.id,
      name: d.name,
      totalTags: d.totalTags,
      assigned: forDiv.reduce((s, r) => s + r.assignedCount, 0),
      delivered: forDiv.reduce((s, r) => s + r.deliveredCount, 0),
    };
  });
  const deliveredElsewhere = ownRowsOnly
    ? 0
    : Math.max(0, delivered - divisions.reduce((s, d) => s + d.delivered, 0));

  const headerScope = projectScope({
    contractTags: project.contractTags ?? null,
    totalTags: project.totalTags ?? 0,
    deliveredTags: delivered,
  });

  return (
    <div className="card p-6 mb-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold text-ink-900">
            {project.name}
          </h2>
          <p className="text-sm text-ink-500 mt-1.5">
            {project.client && (
              <>
                <span className="text-ink-700 font-medium">{project.client}</span>
                {" · "}
              </>
            )}
            Owner <span className="text-ink-700">{project.owner}</span>
            {project.startDate && (
              <>
                {" · "}Start{" "}
                <span className="text-ink-700">{fmtDay(project.startDate)}</span>
              </>
            )}
            {project.handoverDate && (
              <>
                {" · "}Handover{" "}
                <span className="text-ink-700 font-medium">
                  {fmtDay(project.handoverDate)}
                </span>
              </>
            )}
          </p>
          {project.description && (
            <p className="text-sm text-ink-500 mt-2 max-w-2xl">
              {project.description}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onEdit}
              className="btn-ghost border border-ink-200 inline-flex items-center gap-1.5"
              title="Edit project"
            >
              <Pencil size={14} /> Edit
            </button>
            <ConfirmButton
              onConfirm={remove}
              title="Delete project (and its tasks)"
              confirmLabel="Delete project?"
              className="btn-ghost border border-ink-200 text-brand-redText inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Delete
            </ConfirmButton>
          </div>
        )}
      </div>

      {total > 0 && (
        <>
          {/* The client side of the ledger first, when it is tracked:
              what was agreed, and what we are still waiting to be given.
              Then our side: of what we hold, how much is done. */}
          {headerScope.withClientTags !== null && (
            <div className="grid grid-cols-2 gap-3 mt-5">
              <HeroStat
                label={SCOPE_LABELS.contract}
                value={headerScope.contractTags ?? 0}
              />
              <HeroStat
                label={SCOPE_LABELS.withClient}
                value={headerScope.withClientTags}
                tone={
                  headerScope.withClientTags > 0
                    ? "text-brand-yellowText"
                    : undefined
                }
              />
            </div>
          )}

          <div
            className={`grid grid-cols-2 gap-3 mt-5 ${
              pending === null ? "sm:grid-cols-3" : "sm:grid-cols-4"
            }`}
          >
            <HeroStat label={SCOPE_LABELS.received} value={total} />
            <HeroStat label="Delivered" value={delivered} tone="text-brand-greenText" />
            {pending !== null && (
              <HeroStat
                label="Pending approval"
                value={pending}
                tone={pending > 0 ? "text-brand-yellowText" : undefined}
              />
            )}
            <HeroStat label="Remaining" value={remaining} />
          </div>
          <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden mt-4">
            <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-ink-500 mt-1.5">
            {Math.round(pct)}% delivered
            {assigned < total && (
              <span className="text-brand-yellowText">
                {" · "}
                {total - assigned} tags not yet assigned to anyone
              </span>
            )}
          </p>

          {/*
            Delivery by division, in the header rather than in a panel of
            its own further down.

            It answers the same question as the four figures above it —
            how much of this project is done — just broken out by
            discipline. Keeping it in a separate card meant scrolling past
            the staffing table to find out where the work actually stands.
          */}
          <DivisionBreakdown
            divisions={divisions}
            deliveredElsewhere={deliveredElsewhere}
          />
        </>
      )}
    </div>
  );
}

/**
 * Past this many divisions the list stops being a glance and starts being
 * a table, so the names get clipped to keep every row one line tall. Under
 * it, they are shown whole however long they are.
 */
const CROWDED_DIVISIONS = 5;

/**
 * Per-division delivery: what each discipline holds, and how far along it
 * is. One row each, with the bar carrying the comparison so the eye does
 * not have to divide two four-figure numbers.
 *
 * Silent for a project with no divisions — an empty table under the hero
 * figures is worse than nothing there at all.
 */
function DivisionBreakdown({
  divisions,
  deliveredElsewhere,
}: {
  divisions: {
    id: number;
    name: string;
    totalTags: number;
    assigned: number;
    delivered: number;
  }[];
  /** Delivered tags held by people since removed from the project, so the
   *  split below falls short of the header by this much. */
  deliveredElsewhere: number;
}) {
  if (divisions.length === 0) return null;

  /**
   * Names run long and near-identical — "MRJN 162/169_BATCH 1 CABLE
   * SCHEDULE" against "…BATCH 2 CABLE SCHEDULE" — and it is the tail that
   * tells them apart. So a crowded list clips rather than wraps, and the
   * full name stays available on hover and to a screen reader.
   */
  const crowded = divisions.length > CROWDED_DIVISIONS;

  return (
    <div className="mt-5 pt-4 border-t border-ink-100">
      <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
        Delivery by division
        {crowded && (
          <span className="text-ink-400 font-normal normal-case tracking-normal">
            {" "}
            — {divisions.length} of them
          </span>
        )}
      </h3>
      {/* One per row, full width. Two columns fitted twice as many on a
          screen and gave each of them half the room, which is the wrong
          trade when the names are the hard part to read. */}
      <ul className="grid gap-2.5">
        {divisions.map((d) => {
          const scope = d.totalTags || d.assigned;
          const pct = scope > 0 ? (d.delivered / scope) * 100 : 0;
          const left = Math.max(0, scope - d.delivered);
          return (
            <li key={d.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span
                  title={d.name}
                  className={`text-ink-800 font-medium min-w-0 ${
                    crowded ? "truncate" : "break-words"
                  }`}
                >
                  {d.name}
                </span>
                <span className="text-ink-500 shrink-0 tabular-nums">
                  <strong className="text-brand-greenText">{d.delivered}</strong>
                  {" / "}
                  {scope}
                  <span className="text-ink-400"> · {left} left</span>
                </span>
              </div>
              <div className="h-1 rounded-pill bg-ink-100 overflow-hidden mt-1">
                <div
                  className="h-full bg-brand-green"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {deliveredElsewhere > 0 && (
        <p className="text-xs text-ink-500 mt-2.5">
          A further{" "}
          <strong className="text-brand-greenText tabular-nums">
            {deliveredElsewhere}
          </strong>{" "}
          delivered by people since removed from this project. Their work
          still counts; they no longer sit against a division.
        </p>
      )}
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-card border border-ink-200 px-4 py-3">
      <div className="text-xs text-ink-500 font-medium uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`font-heading text-2xl font-semibold mt-1 ${tone ?? "text-ink-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

