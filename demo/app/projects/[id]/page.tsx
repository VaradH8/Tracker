"use client";

import { use, useEffect, useState, type KeyboardEvent } from "react";
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
  Download,
  History,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TaskCard } from "@/components/TaskCard";
import {
  PROJECTS,
  TASK_TEMPLATES,
  CURRENT_WEEK,
  weekNumberOf,
  clientById,
  projectById,
  projectStatusPill,
  projectLaborCost,
  formatINR,
  type Priority,
  type Status,
} from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useRole, landingFor } from "@/lib/role";
import { useMyFirstName } from "@/lib/account-store";
import {
  canAccessProject,
  canExportData,
  canSeeProjectAudit,
  canSeeProjectFinancials,
} from "@/lib/access";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
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
  const project = projectById(projectId);
  if (!project) notFound();

  const [role, , hydrated] = useRole();
  const router = useRouter();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const {
    forProject,
    addTask,
    tasks: allTasks,
    timeEntries,
    auditLog,
  } = useTasks();

  const me = useMyFirstName();
  const showFinancials = canSeeProjectFinancials(role);
  const showAudit = canSeeProjectAudit(role);
  const showExport = canExportData(role);
  const isAdmin = role === "Admin";
  const allowed = canAccessProject(role, projectId, PROJECTS, allTasks, me);
  const laborCost = projectLaborCost(projectId, allTasks, timeEntries);

  const [tab, setTab] = useState<Tab>("tasks");
  const [weekFilter, setWeekFilter] = useState<"all" | number>("all");

  useEffect(() => {
    if (hydrated && !allowed) {
      router.replace(landingFor(role));
    }
  }, [hydrated, allowed, role, router]);

  const client = clientById(project.clientId);
  const tasks = forProject(projectId);
  const canEdit = role === "Admin" || role === "Coordinator";

  const projectAudit = auditLog.filter((a) => a.scope === project.name);

  const tabs: Tab[] = ["tasks", "details"];
  if (showAudit) tabs.push("history");
  const activeTab = tabs.includes(tab) ? tab : "tasks";

  if (!hydrated || !allowed) {
    return (
      <AppShell>
        <div className="min-h-[60vh] grid place-items-center p-6">
          <div className="card p-8 max-w-md text-center">
            <h1 className="font-heading text-xl font-semibold mb-2">
              {hydrated ? "Not on this project" : "Loading…"}
            </h1>
            {hydrated && (
              <p className="text-sm text-ink-500">
                You're not assigned to anything on this project. Taking you
                back.
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
            {canEdit && (
              <button
                onClick={() => setCreateOpen(true)}
                className="btn-primary"
              >
                <Plus size={16} className="mr-1.5" /> New task
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
            value={`${project.progress}%`}
            sub="of plan"
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
            value={new Date(project.targetDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
            sub={
              new Date(project.targetDate) < new Date("2026-05-06")
                ? "overdue"
                : "on calendar"
            }
            tone={
              new Date(project.targetDate) < new Date("2026-05-06")
                ? "red"
                : "default"
            }
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
                <option value={CURRENT_WEEK}>
                  This week (W{CURRENT_WEEK})
                </option>
                <option value={CURRENT_WEEK - 1}>
                  Last week (W{CURRENT_WEEK - 1})
                </option>
                <option value={CURRENT_WEEK + 1}>
                  Next week (W{CURRENT_WEEK + 1})
                </option>
                {Array.from(
                  new Set(tasks.map((t) => weekNumberOf(t.targetDate))),
                )
                  .filter(
                    (w) =>
                      w !== CURRENT_WEEK &&
                      w !== CURRENT_WEEK - 1 &&
                      w !== CURRENT_WEEK + 1,
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
                    tasks.filter(
                      (t) => weekNumberOf(t.targetDate) === weekFilter,
                    ).length
                  }{" "}
                  task{
                    tasks.filter(
                      (t) => weekNumberOf(t.targetDate) === weekFilter,
                    ).length === 1
                      ? ""
                      : "s"
                  }{" "}
                  this week
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {COLUMNS.map((col) => {
                const colTasks = tasks
                  .filter((t) => t.status === col.id)
                  .filter(
                    (t) =>
                      weekFilter === "all" ||
                      weekNumberOf(t.targetDate) === weekFilter,
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
                    {canEdit && (
                      <InlineAddTask
                        onAdd={(title) =>
                          addTask({ title, projectId, status: col.id })
                        }
                      />
                    )}
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
                <h2 className="font-heading text-lg font-semibold mb-3">
                  Team
                </h2>
                <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                  <Row
                    icon={<Users size={14} />}
                    label="Lead"
                    value={project.lead ?? "—"}
                  />
                  <Row
                    icon={<Users size={14} />}
                    label="Co-ordinator"
                    value={project.coordinator}
                  />
                  <Row
                    icon={<Users size={14} />}
                    label="Business Developer"
                    value={project.bd}
                  />
                  <Row
                    icon={<Users size={14} />}
                    label="Team members"
                    value={
                      project.teamMembers.length > 0
                        ? project.teamMembers.join(", ")
                        : "—"
                    }
                  />
                </dl>
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

              {isAdmin && (
                <div className="card p-6 border-brand-yellowBorder bg-brand-yellowBg/40">
                  <h2 className="font-heading text-lg font-semibold mb-1">
                    Labour cost — Admin only
                  </h2>
                  <p className="text-xs text-ink-500 mb-4">
                    Σ (hours logged on this project × each person&apos;s
                    hourly rate)
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="font-heading text-xl font-semibold">
                        {project.budgetHours}h
                      </div>
                      <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                        Budget
                      </div>
                    </div>
                    <div>
                      <div className="font-heading text-xl font-semibold">
                        {project.loggedHours}h
                      </div>
                      <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                        Logged
                      </div>
                    </div>
                    <div>
                      <div className="font-heading text-xl font-semibold text-brand-yellowText">
                        {formatINR(laborCost)}
                      </div>
                      <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                        Cost to date
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
            <div className="flex items-center gap-2 mb-4">
              <History size={18} className="text-brand-blue" />
              <h2 className="font-heading text-lg font-semibold">
                Activity history
              </h2>
              <span className="text-xs text-ink-500">
                · everything that's happened on this project
              </span>
            </div>
            {projectAudit.length === 0 ? (
              <p className="text-sm text-ink-500 italic">
                No activity yet on this project.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {projectAudit.map((a) => (
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
                      <span className="text-xs text-ink-400">{a.when}</span>
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
          onClose={() => setCreateOpen(false)}
          onCreate={(input) => {
            addTask({ projectId, ...input });
            setCreateOpen(false);
            toast.show(`Task “${input.title}” created.`);
          }}
        />
      )}
    </AppShell>
  );
}

function CreateTaskModal({
  projectName,
  onClose,
  onCreate,
}: {
  projectName: string;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    status: Status;
    description?: string;
    priority?: Priority;
    estimatedHours?: number | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("To Do");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [estHours, setEstHours] = useState("");
  const [templateId, setTemplateId] = useState<string>("");

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const t = TASK_TEMPLATES.find((x) => String(x.id) === id);
    if (!t) return;
    if (!title.trim()) setTitle(t.name);
    setDescription(t.description);
    setStatus(t.defaultStatus);
    setPriority(t.priority);
    setEstHours(String(t.estimatedHours));
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
    });
  }

  const chosenTemplate = TASK_TEMPLATES.find(
    (x) => String(x.id) === templateId,
  );

  return (
    <Modal title="New task" onClose={onClose} size="lg">
      <p className="text-sm text-ink-500 mb-5 truncate">In {projectName}</p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Start from a template{" "}
        <span className="text-ink-400 font-normal">(optional)</span>
      </label>
      <select
        value={templateId}
        onChange={(e) => applyTemplate(e.target.value)}
        className="w-full px-3 py-2 mb-1 rounded border border-ink-200 text-sm"
      >
        <option value="">Blank task</option>
        {TASK_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {chosenTemplate && (
        <p className="text-[11px] text-ink-500 mb-4 italic">
          {chosenTemplate.hint}
        </p>
      )}
      {!chosenTemplate && <div className="mb-4" />}

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
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

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

function InlineAddTask({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");

  function commit() {
    const t = title.trim();
    if (t) onAdd(t);
    setTitle("");
    setEditing(false);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setTitle("");
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 card p-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder="Task title — Enter to save, Esc to cancel"
          className="w-full text-sm focus:outline-none placeholder:text-ink-400"
        />
      </div>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="mt-2 w-full text-left text-sm text-ink-500 hover:text-brand-blue hover:bg-white px-2 py-1.5 rounded transition-colors flex items-center gap-1.5"
    >
      <Plus size={14} /> Add a task
    </button>
  );
}
