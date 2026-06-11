"use client";

import Link from "next/link";
import {
  Plus,
  Search,
  ArrowRight,
  Users as UsersIcon,
  Clock,
  Calendar,
  FolderKanban,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import {
  PIPELINE,
  PIPELINE_STAGES,
  projectStatusPill,
  formatINR,
  type Project,
  type ProjectStatus,
  type PipelineDeal,
  type PipelineStage,
} from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useProjects } from "@/lib/projects-store";
import { canManageProjects, useRole, type Role } from "@/lib/role";
import { useMyFirstName } from "@/lib/account-store";
import { canSeeProjectFinancials, visibleProjects } from "@/lib/access";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";

export default function ProjectsPage() {
  const [role, , hydrated] = useRole();
  const [tab, setTab] = useState<"active" | "pipeline">("active");
  const [tabTouched, setTabTouched] = useState(false);

  // BD lands on Pipeline; everyone else on Active. (Effect, not initial
  // state, to avoid an SSR/hydration mismatch.)
  useEffect(() => {
    if (hydrated && !tabTouched && role === "BusinessDeveloper") {
      setTab("pipeline");
    }
  }, [hydrated, role, tabTouched]);

  const showPipeline = role !== "Developer";
  const activeTab = showPipeline ? tab : "active";

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-4">
          <h1 className="font-heading text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-ink-500 mt-1">
            {activeTab === "pipeline"
              ? "Deal flow — leads through to kick-off."
              : "Live projects across all clients."}
          </p>
        </header>

        {showPipeline && (
          <div className="border-b border-ink-200 mb-6 flex items-center gap-1">
            {(["active", "pipeline"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setTabTouched(true);
                }}
                className={
                  activeTab === t
                    ? "px-4 py-2 text-sm font-medium border-b-2 border-brand-blue text-brand-blue capitalize"
                    : "px-4 py-2 text-sm font-medium text-ink-500 hover:text-ink-900 capitalize"
                }
              >
                {t === "active" ? "Active" : "Pipeline"}
              </button>
            ))}
          </div>
        )}

        {activeTab === "active" ? (
          <ActiveProjects role={role} />
        ) : (
          <PipelineBoard role={role} />
        )}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Active projects — the live work.                                   */
/* ------------------------------------------------------------------ */

const FILTERS: { id: ProjectStatus | "All"; label: string }[] = [
  { id: "All", label: "All" },
  { id: "Active", label: "Active" },
  { id: "Discovery", label: "Discovery" },
  { id: "On Hold", label: "On Hold" },
  { id: "Delivered", label: "Delivered" },
];

function ActiveProjects({ role }: { role: Role }) {
  const [filter, setFilter] = useState<ProjectStatus | "All">("All");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const showFinancials = canSeeProjectFinancials(role);
  const { tasks } = useTasks();
  const { projects, clients, createProject, createClient } = useProjects();
  const me = useMyFirstName();
  const toast = useToast();

  const myProjects = visibleProjects(role, projects, tasks, me);

  function clientById(id: number) {
    return clients.find((c) => c.id === id);
  }
  const visible = myProjects
    .filter((p) => filter === "All" || p.status === filter)
    .filter((p) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        clientById(p.clientId)?.name.toLowerCase().includes(q)
      );
    });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">
          {role === "Admin" || role === "Coordinator"
            ? `${myProjects.length} projects across ${clients.length} clients`
            : `${myProjects.length} project${myProjects.length === 1 ? "" : "s"} you're on`}
        </p>
        {canManageProjects(role) && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> New project
          </button>
        )}
      </div>

      <div className="card p-3 mb-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects or clients…"
            className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={
              filter === f.id
                ? "pill-blue cursor-pointer"
                : "pill-grey cursor-pointer hover:bg-ink-200"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        myProjects.length === 0 ? (
          <EmptyState
            Icon={FolderKanban}
            title="You're not on any projects yet"
            message="Once a co-ordinator adds you to a project, it shows up here."
          />
        ) : (
          <EmptyState
            Icon={Search}
            title="No projects match"
            message="Try a different search term or clear the status filter."
            action={
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
                className="btn-ghost border border-ink-200"
              >
                Clear filters
              </button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((p) => {
            const client = clientById(p.clientId);
            const projectTasks = tasks.filter((t) => t.projectId === p.id);
            const open = projectTasks.filter(
              (t) => t.status !== "Done",
            ).length;
            const overdue = projectTasks.filter(
              (t) => !!t.overdueDays && t.status !== "Done",
            ).length;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="card p-5 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={projectStatusPill(p.status)}>
                    {p.status}
                  </span>
                  <HealthDot health={p.health} />
                </div>
                <h3 className="font-heading text-base font-semibold leading-snug mb-1 group-hover:text-brand-blue">
                  {p.name}
                </h3>
                <p className="text-xs text-ink-500 mb-4">
                  {client?.name} · {client?.industry}
                </p>

                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                    <span>Progress</span>
                    <span className="font-medium text-ink-700">
                      {p.progress}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-blue"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                  <Stat label="Tasks" value={projectTasks.length} />
                  <Stat label="Open" value={open} />
                  <Stat
                    label="Overdue"
                    value={overdue}
                    tone={overdue > 0 ? "red" : "default"}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-ink-500 pt-3 border-t border-ink-100">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon size={11} />
                      {p.coordinator}
                    </span>
                    {showFinancials && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {p.loggedHours}/{p.budgetHours}h
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={11} />
                    {new Date(p.targetDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                    <ArrowRight
                      size={12}
                      className="text-brand-blue ml-1 group-hover:translate-x-0.5 transition-transform"
                    />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateProjectModal
          clients={clients}
          onClose={() => setCreateOpen(false)}
          onCreate={async ({ name, clientId, newClientName, targetDate }) => {
            let resolvedClientId = clientId;
            // New client requested → create it first.
            if (clientId == null && newClientName) {
              const c = await createClient({ name: newClientName });
              if (!c.ok) {
                toast.show(c.error, "error");
                return;
              }
              resolvedClientId = c.client.id;
            }
            if (resolvedClientId == null) {
              toast.show("Pick a client first.", "error");
              return;
            }
            const r = await createProject({
              name,
              clientId: resolvedClientId,
              targetDate: targetDate || undefined,
            });
            if (!r.ok) {
              toast.show(r.error, "error");
              return;
            }
            setCreateOpen(false);
            toast.show(`Project "${r.project.name}" created.`);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline — deal flow Kanban with drag-and-drop.                    */
/* ------------------------------------------------------------------ */

const STAGE_ACCENT: Record<PipelineStage, string> = {
  Lead: "bg-ink-400",
  Quoted: "bg-brand-blue",
  Won: "bg-brand-green",
  "Kicked off": "bg-brand-yellow",
};

function PipelineBoard({ role }: { role: Role }) {
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<PipelineStage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();
  const canManage = canManageProjects(role);

  useEffect(() => {
    fetch("/api/pipeline", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setDeals(b.deals ?? []))
      .catch(() => null);
  }, []);

  async function onDrop(stage: PipelineStage) {
    if (draggedId == null) {
      setDragOver(null);
      return;
    }
    const deal = deals.find((d) => d.id === draggedId);
    setDeals((prev) =>
      prev.map((d) => (d.id === draggedId ? { ...d, stage } : d)),
    );
    if (deal && deal.stage !== stage) {
      await fetch("/api/pipeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, stage }),
      });
      toast.show(`"${deal.name}" moved to ${stage}.`);
    }
    setDraggedId(null);
    setDragOver(null);
  }

  const weighted = deals
    .filter((d) => d.stage !== "Kicked off")
    .reduce((sum, d) => sum + (d.estimatedValue * d.probability) / 100, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">
          {deals.length} deals ·{" "}
          <span className="text-ink-700 font-medium">
            {formatINR(weighted)}
          </span>{" "}
          weighted open value
        </p>
        {canManage && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> New deal
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PIPELINE_STAGES.map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          const colValue = col.reduce(
            (s, d) => s + d.estimatedValue,
            0,
          );
          const isOver = dragOver === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                if (!canManage) return;
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => onDrop(stage)}
              className={`bg-ink-50 rounded-card p-3 min-h-[420px] transition-colors ${
                isOver ? "bg-brand-blueBg ring-2 ring-brand-blue" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span
                  className={`w-2 h-2 rounded-full ${STAGE_ACCENT[stage]}`}
                />
                <h2 className="font-heading text-sm font-semibold">{stage}</h2>
                <span className="text-xs text-ink-500">{col.length}</span>
              </div>
              <div className="text-[11px] text-ink-400 mb-3 px-1">
                {formatINR(colValue)}
              </div>
              <div className="space-y-2">
                {col.map((d) => (
                  <article
                    key={d.id}
                    draggable={canManage}
                    onDragStart={() => setDraggedId(d.id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOver(null);
                    }}
                    className={`card p-3 group ${
                      canManage ? "cursor-grab active:cursor-grabbing" : ""
                    } ${draggedId === d.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-1 mb-1">
                      <h3 className="text-sm font-medium text-ink-900 leading-snug flex-1">
                        {d.name}
                      </h3>
                      {canManage && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Drop deal "${d.name}"?`)) return;
                            const res = await fetch(`/api/pipeline/${d.id}`, {
                              method: "DELETE",
                            });
                            if (res.ok) {
                              setDeals((prev) =>
                                prev.filter((x) => x.id !== d.id),
                              );
                              toast.show(`Deal "${d.name}" deleted.`, "info");
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-ink-400 hover:text-brand-redText shrink-0"
                          aria-label="Delete deal"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 mb-2">{d.client}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-heading font-semibold text-ink-900">
                        {formatINR(d.estimatedValue)}
                      </span>
                      <span
                        className={
                          d.probability >= 80
                            ? "pill-green text-[10px] py-0"
                            : d.probability >= 50
                              ? "pill-yellow text-[10px] py-0"
                              : "pill-grey text-[10px] py-0"
                        }
                      >
                        {d.probability}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-ink-400 mt-2 pt-2 border-t border-ink-100">
                      <Calendar size={11} />
                      Starts{" "}
                      {new Date(d.expectedStart).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </article>
                ))}
                {col.length === 0 && (
                  <p className="text-xs text-ink-400 italic px-1">
                    {canManage ? "Drop a deal here" : "Empty"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {createOpen && (
        <NewDealModal
          onClose={() => setCreateOpen(false)}
          onCreate={async (deal) => {
            const res = await fetch("/api/pipeline", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(deal),
            });
            if (!res.ok) {
              toast.show("Couldn't add deal.", "error");
              return;
            }
            const body = (await res.json()) as { deal: PipelineDeal };
            setDeals((prev) => [body.deal, ...prev]);
            setCreateOpen(false);
            toast.show(`Deal "${body.deal.name}" added to ${body.deal.stage}.`);
          }}
        />
      )}
    </>
  );
}

function NewDealModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (deal: Omit<PipelineDeal, "id" | "bd">) => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<PipelineStage>("Lead");
  const [start, setStart] = useState("");
  const [probability, setProbability] = useState("20");

  return (
    <Modal title="New deal" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        Add a prospect to the pipeline.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Deal name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Reliance — DCS migration"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Client / prospect
      </label>
      <input
        value={client}
        onChange={(e) => setClient(e.target.value)}
        placeholder="Company name"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Est. value (₹)
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="1500000"
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Probability %
          </label>
          <input
            type="number"
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Stage
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PipelineStage)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Expected start
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() =>
            onCreate({
              name: name.trim() || "Untitled deal",
              client: client.trim() || "Unnamed prospect",
              estimatedValue: Number(value) || 0,
              probability: Number(probability) || 0,
              stage,
              expectedStart: start || "2026-07-01",
            })
          }
          disabled={!name.trim()}
          className="btn-primary"
        >
          Add deal
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function CreateProjectModal({
  clients,
  onClose,
  onCreate,
}: {
  clients: { id: number; name: string }[];
  onClose: () => void;
  onCreate: (input: {
    name: string;
    clientId: number | null;
    newClientName: string | null;
    targetDate: string;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string>(
    clients.length > 0 ? String(clients[0].id) : "__new__",
  );
  const [newClient, setNewClient] = useState("");
  const [target, setTarget] = useState("");

  const addingClient = clientId === "__new__";

  return (
    <Modal title="New project" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        Create a project under a client.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Project name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Saipem — Phase 2"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Client
      </label>
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="w-full px-3 py-2 mb-3 rounded border border-ink-200 text-sm"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new__">+ Add new client…</option>
      </select>
      {addingClient && (
        <input
          value={newClient}
          onChange={(e) => setNewClient(e.target.value)}
          placeholder="New client name"
          className="w-full px-3 py-2 mb-3 rounded border border-brand-blue text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
      )}

      <label className="block text-xs font-medium text-ink-700 mb-1.5 mt-1">
        Target date
      </label>
      <input
        type="date"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() =>
            onCreate({
              name: name.trim() || "Untitled project",
              clientId: addingClient ? null : Number(clientId),
              newClientName: addingClient ? newClient.trim() : null,
              targetDate: target,
            })
          }
          disabled={!name.trim() || (addingClient && !newClient.trim())}
          className="btn-primary"
        >
          Create project
        </button>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "red";
}) {
  return (
    <div className="bg-ink-50 rounded p-2">
      <div
        className={`font-heading text-lg font-semibold ${tone === "red" ? "text-brand-redText" : "text-ink-900"}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-ink-500 uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function HealthDot({ health }: { health: Project["health"] }) {
  const cls =
    health === "green"
      ? "bg-brand-green"
      : health === "yellow"
        ? "bg-brand-yellow"
        : "bg-brand-red";
  const label =
    health === "green"
      ? "On track"
      : health === "yellow"
        ? "Watch"
        : "At risk";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-ink-500"
      title={label}
    >
      <span className={`w-2 h-2 rounded-full ${cls}`} />
      {label}
    </span>
  );
}
