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

/** One project on the index: scope, progress and dates at a glance. */
function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
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
  canManage,
  onEdit,
  onDeleted,
}: {
  project: Project;
  assignments: AssignmentRow[];
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

  const assigned = assignments.reduce((s, r) => s + r.assignedCount, 0);
  const delivered = assignments.reduce((s, r) => s + r.deliveredCount, 0);
  const pending = assignments.reduce((s, r) => s + r.pendingCount, 0);
  const total = project.totalTags || assigned;
  const remaining = Math.max(0, total - delivered);
  const pct = total > 0 ? (delivered / total) * 100 : 0;

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <HeroStat label="Tags total" value={total} />
            <HeroStat label="Delivered" value={delivered} tone="text-brand-greenText" />
            <HeroStat
              label="Pending approval"
              value={pending}
              tone={pending > 0 ? "text-brand-yellowText" : undefined}
            />
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
        </>
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

