"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Mail,
  Calendar,
  Clock,
  Users,
  Plus,
  Upload,
  Download,
  History,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TaskCard } from "@/components/TaskCard";
import {
  currentWeek,
  formatDateLong,
  taskInWeek,
  todayISO,
  weekAnchorOf,
  projectStatusPill,
  projectProgress,
  type Priority,
  type Status,
} from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import {
  useProjects,
  type ProjectMemberRole,
} from "@/lib/projects-store";
import { useRole, landingFor, candidatesForProjectRole } from "@/lib/role";
import { useAccounts, useMyFirstName } from "@/lib/account-store";
import {
  canAccessProject,
  canExportData,
  canSeeProjectAudit,
  canSeeProjectFinancials,
} from "@/lib/access";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { PeoplePicker } from "@/components/PeoplePicker";
import { ImportTasksModal } from "@/components/ImportTasksModal";
import { toCsv, downloadCsv } from "@/lib/csv";

const COLUMNS: { id: Status; title: string; accent: string }[] = [
  { id: "To Do", title: "To Do", accent: "bg-ink-400" },
  { id: "In Progress", title: "In Progress", accent: "bg-brand-blue" },
  { id: "Blocked", title: "Blocked", accent: "bg-brand-red" },
  { id: "In review", title: "In review", accent: "bg-brand-yellow" },
  { id: "Done", title: "Done", accent: "bg-brand-green" },
];

type Tab = "tasks" | "details" | "history";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = Number(id);
  const {
    projects,
    clients,
    hydrated: projectsHydrated,
    deleteProject,
    updateProject,
    toggleProjectMember,
  } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const [isDeleting, setIsDeleting] = useState(false);
  // Don't call notFound() while we're in the middle of deleting this
  // very project — the store already removed it before the router has
  // navigated to /projects, and throwing here trips the 404 page mid-
  // redirect (which then crashes with a stale provider reference when
  // the user clicks "Take me home").
  if (projectsHydrated && !project && !isDeleting) notFound();

  const [role, , hydrated] = useRole();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const {
    forProject,
    addTask,
    tasks: allTasks,
    auditLog,
    refresh: refreshTasks,
  } = useTasks();

  const me = useMyFirstName();
  const showFinancials = canSeeProjectFinancials(role);
  const showAudit = canSeeProjectAudit(role);
  const showExport = canExportData(role);
  const isAdmin = role === "Admin";
  const allowed = canAccessProject(role, projectId, projects, allTasks, me);

  const [tab, setTab] = useState<Tab>("tasks");
  const [weekFilter, setWeekFilter] = useState<"all" | number>("all");
  // Task status filter for the board: all tasks, only open (not Done), or
  // only overdue (past target date and still open).
  const [taskView, setTaskView] = useState<"all" | "open" | "overdue">("all");
  const [editOpen, setEditOpen] = useState(false);
  const [histQuery, setHistQuery] = useState("");
  const [histDate, setHistDate] = useState("");
  const thisWeek = currentWeek();

  useEffect(() => {
    if (hydrated && !allowed) {
      router.replace(landingFor(role));
    }
  }, [hydrated, allowed, role, router]);

  const client = clients.find((c) => c.id === project?.clientId);
  const tasks = forProject(projectId);
  // Lead + Co-ordinator own the team roster (they add developers) and the
  // project's editable details. A Business Developer can't manage the
  // team, but can still spin up tasks on the project they kicked off —
  // the Lead/Co-ordinator then assign developers to those tasks.
  const canManageTeam =
    role === "Admin" || role === "Lead" || role === "Coordinator";
  const canCreateTasks = canManageTeam || role === "BusinessDeveloper";
  // "Import Tasks" is Admin/Coordinator only (the server enforces the same
  // gate, and scopes Coordinators to projects they coordinate).
  const canImportTasks = role === "Admin" || role === "Coordinator";

  const projectAudit = auditLog.filter(
    (a) => project && a.scope === project.name,
  );
  const filteredAudit = projectAudit.filter((a) => {
    if (histDate && a.whenExact.slice(0, 10) !== histDate) return false;
    if (histQuery.trim()) {
      const q = histQuery.toLowerCase();
      const hay = [
        a.actor,
        prettyAction(a.action),
        a.action,
        a.taskTitle,
        a.before,
        a.after,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const tabs: Tab[] = ["tasks", "details"];
  if (showAudit) tabs.push("history");
  const activeTab = tabs.includes(tab) ? tab : "tasks";

  if (!hydrated || !projectsHydrated || !project || !allowed) {
    return (
      <AppShell>
        <div className="min-h-[60vh] grid place-items-center p-6">
          <div className="card p-8 max-w-md text-center">
            <h1 className="font-heading text-xl font-semibold mb-2">
              {isDeleting
                ? "Project deleted"
                : hydrated && projectsHydrated
                  ? "Not on this project"
                  : "Loading…"}
            </h1>
            {(isDeleting || (hydrated && projectsHydrated)) && (
              <p className="text-sm text-ink-500">
                {isDeleting
                  ? "Taking you back to the projects list."
                  : "You're not assigned to anything on this project. Taking you back."}
              </p>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-blue mb-4"
        >
          <ArrowLeft size={14} /> All projects
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={projectStatusPill(project.status)}>
                {project.status}
              </span>
              <HealthDot health={project.health} />
            </div>
            <h1 className="font-heading text-3xl font-semibold">
              {project.name}
            </h1>
            {client && (
              <p className="text-sm text-ink-500 mt-1 inline-flex items-center gap-1.5">
                <Building2 size={13} /> {client.name} · {client.industry}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showExport && (
              <button
                onClick={() => {
                  const csv = toCsv(
                    ["Task", "Status", "Priority", "Responsible", "Accountable", "Target date"],
                    tasks.map((t) => [
                      t.title,
                      t.status,
                      t.priority,
                      t.responsible,
                      t.assignees.join("; "),
                      t.targetDate,
                    ]),
                  );
                  downloadCsv(
                    `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-tasks.csv`,
                    csv,
                  );
                  toast.show(`Exported ${tasks.length} tasks to CSV.`);
                }}
                className="btn-ghost border border-ink-200"
              >
                <Download size={16} className="mr-1.5" /> Export Excel
              </button>
            )}
            {canManageTeam && (
              <button
                onClick={() => setEditOpen(true)}
                className="btn-ghost border border-ink-200"
                title="Edit project"
              >
                Edit
              </button>
            )}
            {canImportTasks && (
              <button
                onClick={() => setImportOpen(true)}
                className="btn-ghost border border-ink-200"
                title="Import tasks from a spreadsheet"
              >
                <Upload size={16} className="mr-1.5" /> Import Tasks
              </button>
            )}
            {canCreateTasks && (
              <button
                onClick={() => setCreateOpen(true)}
                className="btn-primary"
              >
                <Plus size={16} className="mr-1.5" /> New task
              </button>
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete "${project.name}"?`,
                    body: "Every task, remark, time log, attachment, and audit entry on this project goes with it. There's no undo.",
                    confirmLabel: "Delete project",
                    danger: true,
                  });
                  if (!ok) return;
                  // Capture the name for the toast before the store
                  // update clears our `project` reference, and arm the
                  // isDeleting flag so the render that happens between
                  // "store update" and "router.replace lands" doesn't
                  // throw via notFound().
                  const deletedName = project.name;
                  const deletedId = project.id;
                  setIsDeleting(true);
                  const r = await deleteProject(deletedId);
                  if (!r.ok) {
                    setIsDeleting(false);
                    toast.show(
                      r.error ?? "Couldn't delete project.",
                      "error",
                    );
                    return;
                  }
                  toast.show(`Project "${deletedName}" deleted.`, "info");
                  // replace, not push — the deleted page shouldn't be
                  // reachable via the browser back button.
                  router.replace("/projects");
                }}
                className="btn-ghost border border-ink-200 text-brand-redText hover:bg-brand-redBg"
                title="Delete project"
              >
                <Trash2 size={16} className="mr-1.5" /> Delete
              </button>
            )}
          </div>
        </div>

        <div
          className={`grid gap-4 mb-6 ${
            showFinancials ? "md:grid-cols-4" : "md:grid-cols-3"
          }`}
        >
          <Stat
            label="Progress"
            value={`${projectProgress(projectId, tasks)}%`}
            sub={`${tasks.filter((t) => t.status === "Done").length}/${tasks.length} done`}
            tone="blue"
          />
          {showFinancials && (
            <Stat
              label="Hours"
              value={`${project.loggedHours}/${project.budgetHours}`}
              sub="logged / budget"
              tone={
                project.loggedHours > project.budgetHours * 0.9
                  ? "yellow"
                  : "default"
              }
            />
          )}
          <Stat
            label="Tasks"
            value={tasks.length}
            sub={`${tasks.filter((t) => t.status === "Done").length} done`}
          />
          <Stat
            label="Target"
            value={formatDateLong(project.targetDate)}
            sub={project.targetDate < todayISO() ? "overdue" : "on calendar"}
            tone={project.targetDate < todayISO() ? "red" : "default"}
          />
        </div>

        <div className="border-b border-ink-200 mb-6 flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                activeTab === t
                  ? "px-4 py-2 text-sm font-medium border-b-2 border-brand-blue text-brand-blue capitalize"
                  : "px-4 py-2 text-sm font-medium text-ink-500 hover:text-ink-900 capitalize"
              }
            >
              {t}
            </button>
          ))}
        </div>

        {activeTab === "tasks" && (
          <>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-ink-500">Week</span>
              <select
                value={weekFilter === "all" ? "all" : String(weekFilter)}
                onChange={(e) =>
                  setWeekFilter(
                    e.target.value === "all"
                      ? "all"
                      : Number(e.target.value),
                  )
                }
                className="text-sm rounded border border-ink-200 px-2 py-1 bg-white"
              >
                <option value="all">All weeks</option>
                <option value={thisWeek}>
                  This week (W{thisWeek})
                </option>
                <option value={thisWeek - 1}>
                  Last week (W{thisWeek - 1})
                </option>
                <option value={thisWeek + 1}>
                  Next week (W{thisWeek + 1})
                </option>
                {Array.from(
                  new Set(tasks.map((t) => weekAnchorOf(t))),
                )
                  .filter(
                    (w) =>
                      w !== thisWeek &&
                      w !== thisWeek - 1 &&
                      w !== thisWeek + 1,
                  )
                  .sort((a, b) => a - b)
                  .map((w) => (
                    <option key={w} value={w}>
                      Week {w}
                    </option>
                  ))}
              </select>
              {weekFilter !== "all" && (
                <span className="text-xs text-ink-500">
                  {
                    tasks.filter((t) => taskInWeek(t, weekFilter)).length
                  }{" "}
                  task{
                    tasks.filter((t) => taskInWeek(t, weekFilter)).length === 1
                      ? ""
                      : "s"
                  }{" "}
                  this week
                </span>
              )}
              <span className="text-xs text-ink-500 ml-2">Show</span>
              {(
                [
                  { id: "all", label: "All" },
                  { id: "open", label: "Open" },
                  { id: "overdue", label: "Overdue" },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setTaskView(v.id)}
                  className={
                    taskView === v.id
                      ? "pill-blue cursor-pointer"
                      : "pill-grey cursor-pointer hover:bg-ink-200"
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {COLUMNS.map((col) => {
                const colTasks = tasks
                  .filter((t) => t.status === col.id)
                  .filter(
                    (t) => weekFilter === "all" || taskInWeek(t, weekFilter),
                  )
                  .filter(
                    (t) =>
                      taskView === "all" ||
                      (taskView === "open" && t.status !== "Done") ||
                      (taskView === "overdue" && !!t.overdueDays),
                  );
                return (
                  <div
                    key={col.id}
                    className="bg-ink-50 rounded-card p-3 min-h-[400px] flex flex-col"
                  >
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                      <h2 className="font-heading text-sm font-semibold">
                        {col.title}
                      </h2>
                      <span className="text-xs text-ink-500">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="space-y-2 flex-1">
                      {colTasks.map((t) => (
                        <TaskCard key={t.id} task={t} hideProject />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === "details" && client && (
          <div className="grid lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 space-y-6">
              <div className="card p-6">
                <h2 className="font-heading text-lg font-semibold mb-3">
                  About this project
                </h2>
                <p className="text-sm text-ink-700 leading-relaxed">
                  {project.description ?? "No description yet."}
                </p>
              </div>

              <div className="card p-6">
                <h2 className="font-heading text-lg font-semibold mb-1">
                  Team
                </h2>
                <p className="text-xs text-ink-500 mb-4">
                  Anyone listed below has access to this project.
                </p>
                <ProjectRoleLane
                  label="Leads"
                  role="Lead"
                  projectId={project.id}
                  members={project.leads}
                  canEdit={canManageTeam}
                  onToggle={async (name, role) => {
                    const r = await toggleProjectMember(project.id, name, role);
                    if (!r.ok) toast.show(r.error);
                  }}
                />
                <ProjectRoleLane
                  label="Coordinators"
                  role="Coordinator"
                  projectId={project.id}
                  members={project.coordinators}
                  canEdit={canManageTeam}
                  onToggle={async (name, role) => {
                    const r = await toggleProjectMember(project.id, name, role);
                    if (!r.ok) toast.show(r.error);
                  }}
                />
                <ProjectRoleLane
                  label="Developers"
                  role="Developer"
                  projectId={project.id}
                  members={project.developers}
                  canEdit={canManageTeam}
                  onToggle={async (name, role) => {
                    const r = await toggleProjectMember(project.id, name, role);
                    if (!r.ok) toast.show(r.error);
                  }}
                />
                <ProjectRoleLane
                  label="Business Developers"
                  role="BD"
                  projectId={project.id}
                  members={project.bds}
                  canEdit={canManageTeam}
                  onToggle={async (name, role) => {
                    const r = await toggleProjectMember(project.id, name, role);
                    if (!r.ok) toast.show(r.error);
                  }}
                />
              </div>

              <div className="card p-6">
                <h2 className="font-heading text-lg font-semibold mb-3">
                  {showFinancials ? "Schedule & budget" : "Schedule"}
                </h2>
                <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                  <Row icon={<Calendar size={14} />} label="Start" value={project.startDate} />
                  <Row icon={<Calendar size={14} />} label="Target" value={project.targetDate} />
                  {showFinancials && (
                    <>
                      <Row icon={<Clock size={14} />} label="Budget" value={`${project.budgetHours} hrs`} />
                      <Row icon={<Clock size={14} />} label="Logged" value={`${project.loggedHours} hrs`} />
                    </>
                  )}
                </dl>
              </div>

            </section>

            <aside>
              <div className="card p-6">
                <div className="flex items-center gap-1.5 mb-3">
                  <Building2 size={16} className="text-brand-blue" />
                  <h2 className="font-heading text-lg font-semibold">Client</h2>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-0.5">
                      Name
                    </div>
                    <div className="text-ink-900 font-medium">{client.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-0.5">
                      Industry
                    </div>
                    <div className="text-ink-700">{client.industry}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-0.5">
                      Primary contact
                    </div>
                    <div className="text-ink-700">{client.primaryContact}</div>
                    <a
                      href={`mailto:${client.email}`}
                      className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <Mail size={11} /> {client.email}
                    </a>
                  </div>
                  <div>
                    <div className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-0.5">
                      Client since
                    </div>
                    <div className="text-ink-700">{client.since}</div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {activeTab === "history" && showAudit && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <History size={18} className="text-brand-blue" />
              <h2 className="font-heading text-lg font-semibold">
                Activity history
              </h2>
              <div className="flex items-center gap-2 ml-auto">
                <input
                  value={histQuery}
                  onChange={(e) => setHistQuery(e.target.value)}
                  placeholder="Search activity…"
                  className="px-3 py-1.5 rounded border border-ink-200 text-sm w-44"
                />
                <input
                  type="date"
                  value={histDate}
                  onChange={(e) => setHistDate(e.target.value)}
                  className="px-2 py-1.5 rounded border border-ink-200 text-sm"
                />
                {(histQuery || histDate) && (
                  <button
                    onClick={() => {
                      setHistQuery("");
                      setHistDate("");
                    }}
                    className="text-xs text-ink-500 hover:text-ink-900"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {filteredAudit.length === 0 ? (
              <p className="text-sm text-ink-500 italic">
                {projectAudit.length === 0
                  ? "No activity yet on this project."
                  : "No activity matches your filters."}
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {filteredAudit.map((a) => (
                  <li key={a.id} className="py-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-ink-100 grid place-items-center text-[10px] font-heading font-medium text-ink-700 shrink-0">
                      {a.actor[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-900">
                        <span className="font-medium">{a.actor}</span>{" "}
                        <span className="text-ink-500">
                          ({prettyAction(a.action)})
                        </span>{" "}
                        {a.taskTitle && (
                          <span className="text-ink-700">— {a.taskTitle}</span>
                        )}
                      </p>
                      {(a.before || a.after) && (
                        <p className="text-xs text-ink-500 mt-0.5">
                          <code className="text-brand-redText bg-brand-redBg px-1 rounded">
                            {a.before}
                          </code>{" "}
                          →{" "}
                          <code className="text-brand-greenText bg-brand-greenBg px-1 rounded">
                            {a.after}
                          </code>
                        </p>
                      )}
                      <span
                        className="text-xs text-ink-400"
                        title={a.when}
                      >
                        {fmtExactWhen(a.whenExact)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateTaskModal
          projectName={project.name}
          canAssign={canManageTeam}
          onClose={() => setCreateOpen(false)}
          onCreate={(input) => {
            addTask({ projectId, ...input });
            setCreateOpen(false);
            toast.show(`Task "${input.title}" created.`);
          }}
        />
      )}

      {importOpen && (
        <ImportTasksModal
          projectId={projectId}
          projectName={project.name}
          onClose={() => setImportOpen(false)}
          onImported={refreshTasks}
        />
      )}

      {editOpen && (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSave={async (patch) => {
            const result = await updateProject(project.id, patch);
            if (!result.ok) {
              // Surface the real failure instead of a false "saved" —
              // otherwise the edit silently vanishes on the next refresh.
              toast.show(result.error);
              return;
            }
            toast.show("Project updated.");
            setEditOpen(false);
          }}
        />
      )}
    </AppShell>
  );
}

function ProjectRoleLane({
  label,
  role,
  members,
  canEdit,
  onToggle,
}: {
  label: string;
  role: ProjectMemberRole;
  projectId: number;
  members: string[];
  canEdit: boolean;
  onToggle: (name: string, role: ProjectMemberRole) => void | Promise<void>;
}) {
  const { accounts } = useAccounts();
  // The "+ Add…" dropdown for a lane only offers people whose global role
  // matches it — adding to Developers lists only Developers, etc. People
  // already on the lane render as removable chips regardless.
  const available = candidatesForProjectRole(accounts, role);
  const others = available.filter((n) => !members.includes(n));

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-1.5">
        <Users size={13} className="text-ink-500" />
        <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide">
          {label}{" "}
          <span className="font-medium normal-case text-ink-400">
            ({members.length})
          </span>
        </h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {members.length === 0 && (
          <span className="text-xs text-ink-400 italic py-0.5">
            None assigned
          </span>
        )}
        {members.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-pill bg-brand-blueBg text-brand-blue text-xs font-medium"
          >
            {m}
            {canEdit && (
              <button
                onClick={() => onToggle(m, role)}
                className="p-0.5 -m-0.5 rounded hover:bg-brand-blue/20"
                aria-label={`Remove ${m} from ${label}`}
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {canEdit && others.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onToggle(e.target.value, role);
            }}
            className="text-xs rounded border border-ink-200 px-2 py-1 bg-white"
          >
            <option value="">+ Add…</option>
            {others.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function EditProjectModal({
  project,
  onClose,
  onSave,
}: {
  project: {
    name: string;
    status: string;
    leads: string[];
    coordinators: string[];
    developers: string[];
    bds: string[];
    startDate: string;
    targetDate: string;
    budgetHours: number;
    health: string;
    description?: string;
  };
  onClose: () => void;
  onSave: (patch: {
    name: string;
    status: string;
    leads: string[];
    coordinators: string[];
    developers: string[];
    bds: string[];
    startDate: string;
    targetDate: string;
    budgetHours: number;
    health: string;
    description: string | null;
  }) => void | Promise<void>;
}) {
  const { accounts } = useAccounts();
  // Role-scoped candidates per lane, unioned with whoever's already on the
  // lane so existing members always stay visible and removable — even if
  // their global role no longer matches.
  const candidatesFor = (lane: "Lead" | "Coordinator" | "Developer" | "BD") =>
    (current: string[]) =>
      Array.from(
        new Set([...candidatesForProjectRole(accounts, lane), ...current]),
      );

  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState(project.status);
  const [leads, setLeads] = useState<string[]>(project.leads);
  const [coords, setCoords] = useState<string[]>(project.coordinators);
  const [devs, setDevs] = useState<string[]>(project.developers);
  const [bds, setBds] = useState<string[]>(project.bds);
  const [startDate, setStartDate] = useState(project.startDate);
  const [targetDate, setTargetDate] = useState(project.targetDate);
  const [budgetHours, setBudgetHours] = useState(String(project.budgetHours));
  const [health, setHealth] = useState(project.health);
  const [description, setDescription] = useState(project.description ?? "");

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    n: string,
  ) =>
    setList(list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);

  return (
    <Modal title="Edit project" onClose={onClose} size="lg">
      <p className="text-sm text-ink-500 mb-5">
        Update the project&apos;s plan, schedule, and team rosters.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          >
            <option>Discovery</option>
            <option>Active</option>
            <option>On Hold</option>
            <option>Delivered</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Health
          </label>
          <select
            value={health}
            onChange={(e) => setHealth(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          >
            <option value="green">Green · on track</option>
            <option value="yellow">Yellow · watch</option>
            <option value="red">Red · at risk</option>
          </select>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <PeoplePicker
          label="Leads"
          candidates={candidatesFor("Lead")(leads)}
          selected={leads}
          onToggle={(n) => toggle(leads, setLeads, n)}
        />
        <PeoplePicker
          label="Coordinators"
          candidates={candidatesFor("Coordinator")(coords)}
          selected={coords}
          onToggle={(n) => toggle(coords, setCoords, n)}
        />
        <PeoplePicker
          label="Developers"
          candidates={candidatesFor("Developer")(devs)}
          selected={devs}
          onToggle={(n) => toggle(devs, setDevs, n)}
        />
        <PeoplePicker
          label="Business Developers"
          candidates={candidatesFor("BD")(bds)}
          selected={bds}
          onToggle={(n) => toggle(bds, setBds, n)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Start date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Target date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Budget (hours)
          </label>
          <input
            type="number"
            value={budgetHours}
            onChange={(e) => setBudgetHours(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Progress
          </label>
          <p className="text-xs text-ink-500 px-3 py-2 rounded bg-ink-50 border border-ink-100">
            Auto-calculated from completed tasks.
          </p>
        </div>
      </div>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Description
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              name: name.trim() || project.name,
              status,
              leads,
              coordinators: coords,
              developers: devs,
              bds,
              startDate,
              targetDate,
              budgetHours: Number(budgetHours) || 0,
              health,
              description: description.trim() || null,
            })
          }
          disabled={!name.trim()}
          className="btn-primary"
        >
          Save changes
        </button>
      </div>
    </Modal>
  );
}

function CreateTaskModal({
  projectName,
  canAssign,
  onClose,
  onCreate,
}: {
  projectName: string;
  canAssign: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    status: Status;
    description?: string;
    priority?: Priority;
    estimatedHours?: number | null;
    assignees?: string[];
    startDate?: string;
    targetDate?: string;
  }) => void;
}) {
  const { accounts } = useAccounts();
  // Assignable people, split by role — Developers, Co-ordinators, Leads.
  const devCandidates = accounts
    .filter((a) => a.active && a.role === "Developer")
    .map((a) => a.name.split(" ")[0]);
  const coordCandidates = accounts
    .filter((a) => a.active && a.role === "Coordinator")
    .map((a) => a.name.split(" ")[0]);
  const leadCandidates = accounts
    .filter((a) => a.active && (a.role === "Lead" || a.isAdmin))
    .map((a) => a.name.split(" ")[0]);
  const [assigneeTab, setAssigneeTab] = useState<
    "Developer" | "Coordinator" | "Lead"
  >("Developer");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("To Do");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [estHours, setEstHours] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);

  function toggleAssignee(name: string) {
    setAssignees((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function submit() {
    const t = title.trim() || "Untitled task";
    const n = estHours.trim() === "" ? null : Number(estHours);
    onCreate({
      title: t,
      status,
      description: description.trim() || undefined,
      priority,
      estimatedHours: n != null && Number.isFinite(n) ? n : null,
      assignees: assignees.length ? assignees : undefined,
      startDate: startDate || undefined,
      targetDate: targetDate || undefined,
    });
  }

  const tabCandidates =
    assigneeTab === "Developer"
      ? devCandidates
      : assigneeTab === "Coordinator"
        ? coordCandidates
        : leadCandidates;

  return (
    <Modal title="New task" onClose={onClose} size="lg">
      <p className="text-sm text-ink-500 mb-5 truncate">In {projectName}</p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Task title
      </label>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) submit();
        }}
        placeholder="What needs to be done?"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Description{" "}
        <span className="text-ink-400 font-normal">(optional)</span>
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="A line or two about what this needs."
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Start in column
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          >
            <option>To Do</option>
            <option>In Progress</option>
            <option>Blocked</option>
            <option>In review</option>
            <option>Done</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          >
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Start date{" "}
            <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <input
            type="date"
            value={startDate}
            max={targetDate || undefined}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Target date{" "}
            <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <input
            type="date"
            value={targetDate}
            min={startDate || undefined}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
      </div>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Estimated hours{" "}
        <span className="text-ink-400 font-normal">(optional)</span>
      </label>
      <input
        type="number"
        step="0.5"
        min="0"
        value={estHours}
        onChange={(e) => setEstHours(e.target.value)}
        placeholder="e.g. 6"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      {canAssign ? (
        <>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Assign to{" "}
            <span className="text-ink-400 font-normal">
              (developers, co-ordinators &amp; leads — optional)
            </span>
          </label>
          <div className="mb-6 rounded border border-ink-200 bg-ink-50">
            <div className="flex border-b border-ink-200">
              {(["Developer", "Coordinator", "Lead"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAssigneeTab(t)}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium ${
                    assigneeTab === t
                      ? "text-brand-blue border-b-2 border-brand-blue bg-white"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {t === "Developer"
                    ? "Developers"
                    : t === "Coordinator"
                      ? "Co-ordinators"
                      : "Leads"}
                </button>
              ))}
            </div>
            {tabCandidates.length === 0 ? (
              <p className="text-xs text-ink-400 italic p-3">
                No{" "}
                {assigneeTab === "Developer"
                  ? "developers"
                  : assigneeTab === "Coordinator"
                    ? "co-ordinators"
                    : "leads"}{" "}
                available.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-2">
                {tabCandidates.map((n) => {
                  const on = assignees.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleAssignee(n)}
                      className={
                        on
                          ? "inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-pill bg-brand-blue text-white text-xs font-medium"
                          : "inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-pill bg-white border border-ink-200 text-ink-700 hover:bg-ink-100 text-xs font-medium"
                      }
                    >
                      {on && (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {n}
                    </button>
                  );
                })}
              </div>
            )}
            {assignees.length > 0 && (
              <p className="text-[11px] text-ink-500 px-2 pb-2">
                Assigned: {assignees.join(", ")}
              </p>
            )}
          </div>
        </>
      ) : (
        // BD creating a task: a Lead or Co-ordinator assigns the
        // developers afterwards, so there's nothing to pick here.
        <p className="text-xs text-ink-500 italic mb-6 p-2 rounded border border-ink-200 bg-ink-50">
          A Lead or Co-ordinator will assign developers to this task.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="btn-primary"
        >
          Create task
        </button>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub: string;
  tone?: "default" | "blue" | "yellow" | "red";
}) {
  const toneCls =
    tone === "red"
      ? "text-brand-redText"
      : tone === "yellow"
        ? "text-brand-yellowText"
        : tone === "blue"
          ? "text-brand-blue"
          : "text-ink-900";
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-500 font-medium">{label}</div>
      <div className={`font-heading text-2xl font-semibold ${toneCls}`}>
        {value}
      </div>
      <div className="text-xs text-ink-500 mt-0.5">{sub}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-500 uppercase tracking-wide font-semibold flex items-center gap-1 mb-0.5">
        {icon}
        {label}
      </dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}

function HealthDot({ health }: { health: "green" | "yellow" | "red" }) {
  const cls =
    health === "green"
      ? "bg-brand-green"
      : health === "yellow"
        ? "bg-brand-yellow"
        : "bg-brand-red";
  const label =
    health === "green" ? "On track" : health === "yellow" ? "Watch" : "At risk";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
      <span className={`w-2 h-2 rounded-full ${cls}`} /> {label}
    </span>
  );
}

/** ISO → "24-06-2026, 13:09" in the viewer's local time. */
function fmtExactWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function prettyAction(action: string): string {
  switch (action) {
    case "task.status_change":
      return "moved status";
    case "task.mark_important":
      return "marked Important";
    case "task.reassign":
      return "reassigned";
    case "task.create":
      return "created task";
    case "task.approve":
      return "approved";
    case "project.create":
      return "created project";
    case "user.invite":
      return "invited user";
    case "user.role_change":
      return "changed role";
    default:
      return action;
  }
}

