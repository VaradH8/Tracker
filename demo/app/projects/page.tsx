"use client";

import Link from "next/link";
import {
  Plus,
  Search,
  ArrowRight,
  FolderKanban,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { type ProjectStatus } from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useProjects } from "@/lib/projects-store";
import {
  canManageProjects,
  candidatesForProjectRole,
  useRole,
  type Role,
} from "@/lib/role";
import { useAccounts, useMyFirstName } from "@/lib/account-store";
import { visibleProjects } from "@/lib/access";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { PeoplePicker } from "@/components/PeoplePicker";
import { DateInput } from "@/components/DateInput";

export default function ProjectsPage() {
  const [role] = useRole();

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-ink-500 mt-1">
            Live projects across all clients.
          </p>
        </header>

        <ActiveProjects role={role} />
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
  const { tasks } = useTasks();
  const { projects, clients, createProject, createClient, refresh } =
    useProjects();
  const me = useMyFirstName();
  const toast = useToast();
  const { accounts } = useAccounts();

  // Project rosters carry first names; show the full name when it resolves.
  function fullNameOf(first: string): string {
    return accounts.find((a) => a.name.split(" ")[0] === first)?.name ?? first;
  }

  // Fresh list every time the page opens: somebody may have put you on a
  // project since the store last loaded, and nobody should need a
  // browser reload to see it.
  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200">
                <th className="py-3 px-5">Project name</th>
                <th className="py-3 px-5 text-right w-28 whitespace-nowrap">Total tasks</th>
                <th className="py-3 px-5 text-right w-24 whitespace-nowrap">Open</th>
                <th className="py-3 px-5 text-right w-24 whitespace-nowrap">Overdue</th>
                <th className="py-3 px-5">Lead</th>
                <th className="py-3 px-5 text-right w-40">
                  <span className="sr-only">Link</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const projectTasks = tasks.filter((t) => t.projectId === p.id);
                const openTasks = projectTasks.filter((t) => t.status !== "Done");
                const overdue = openTasks.filter((t) => !!t.overdueDays).length;
                const leads = p.leads.map(fullNameOf);
                return (
                  <tr key={p.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                    <td className="py-3 px-5">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-ink-900 hover:text-brand-blue"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums text-ink-700">
                      {projectTasks.length}
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums text-ink-700">
                      {openTasks.length}
                    </td>
                    <td
                      className={`py-3 px-5 text-right tabular-nums ${
                        overdue > 0 ? "text-brand-redText font-semibold" : "text-ink-400"
                      }`}
                    >
                      {overdue}
                    </td>
                    <td className="py-3 px-5 text-ink-700">
                      {leads.length > 0 ? (
                        leads.join(", ")
                      ) : (
                        <span className="text-ink-400">No lead</span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <Link
                        href={`/projects/${p.id}`}
                        className="inline-flex items-center gap-1 text-brand-blue hover:underline whitespace-nowrap"
                      >
                        Open tasks <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateProjectModal
          clients={clients}
          creatorRole={role}
          onClose={() => setCreateOpen(false)}
          onCreate={async ({
            name,
            clientId,
            newClientName,
            startDate,
            targetDate,
            budgetHours,
            description,
            health,
            leads,
            coordinators,
            developers,
            bds,
          }) => {
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
              startDate: startDate || undefined,
              targetDate: targetDate || undefined,
              budgetHours: budgetHours ?? undefined,
              description: description || undefined,
              health,
              leads,
              coordinators,
              developers,
              bds,
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

function CreateProjectModal({
  clients,
  creatorRole,
  onClose,
  onCreate,
}: {
  clients: { id: number; name: string }[];
  creatorRole: Role;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    clientId: number | null;
    newClientName: string | null;
    startDate: string;
    targetDate: string;
    budgetHours: number;
    description: string;
    health: string;
    leads: string[];
    coordinators: string[];
    developers: string[];
    bds: string[];
  }) => void | Promise<void>;
}) {
  const { accounts } = useAccounts();
  // Each lane offers people who hold that global role (admins are also
  // eligible as Leads). The creator is included too, so they can put
  // themselves on the project.
  const leadCandidates = candidatesForProjectRole(accounts, "Lead");
  const coordCandidates = candidatesForProjectRole(accounts, "Coordinator");
  const devCandidates = candidatesForProjectRole(accounts, "Developer");
  const bdCandidates = candidatesForProjectRole(accounts, "BD");

  // A BD scopes the kick-off to picking the Lead + Co-ordinator; the
  // Lead/Co-ordinator fill in developers afterwards. Everyone else
  // (Admin/Lead/Coordinator) gets the full roster up front.
  const isBD = creatorRole === "BusinessDeveloper";

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string>(
    clients.length > 0 ? String(clients[0].id) : "__new__",
  );
  const [newClient, setNewClient] = useState("");
  const [start, setStart] = useState("");
  const [target, setTarget] = useState("");
  const [budgetHours, setBudgetHours] = useState("");
  const [description, setDescription] = useState("");
  const [health, setHealth] = useState("green");
  const [leads, setLeads] = useState<string[]>([]);
  const [coords, setCoords] = useState<string[]>([]);
  const [devs, setDevs] = useState<string[]>([]);
  const [bds, setBds] = useState<string[]>([]);

  const addingClient = clientId === "__new__";

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    n: string,
  ) =>
    setList(list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);

  return (
    <Modal title="New project" onClose={onClose} size="lg">
      <p className="text-sm text-ink-500 mb-5">
        {isBD
          ? "Pick a client and assign the Lead and Co-ordinator. They'll bring in the developers once the project is set up."
          : "Pick a client and assign the team. Only assigned people will see this project in their Projects tab."}
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

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Client
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
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
              className="w-full mt-2 px-3 py-2 rounded border border-brand-blue text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          )}
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

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Start date
          </label>
          <DateInput value={start} max={target || undefined} onChange={(iso: string) => setStart(iso)} className="w-full px-3 py-2 rounded border border-ink-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Target date
          </label>
          <DateInput value={target} min={start || undefined} onChange={(iso: string) => setTarget(iso)} className="w-full px-3 py-2 rounded border border-ink-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Budget (hours)
          </label>
          <input
            type="number"
            min="0"
            value={budgetHours}
            onChange={(e) => setBudgetHours(e.target.value)}
            placeholder="80"
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
      </div>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Description{" "}
        <span className="text-ink-400 font-normal">(optional)</span>
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="What's this project about?"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <div className="space-y-3 mb-6">
        <PeoplePicker
          label="Leads"
          candidates={leadCandidates}
          selected={leads}
          onToggle={(n) => toggle(leads, setLeads, n)}
          emptyHint="No Leads yet. Add users with the Lead role in Admin → Users."
        />
        <PeoplePicker
          label="Coordinators"
          candidates={coordCandidates}
          selected={coords}
          onToggle={(n) => toggle(coords, setCoords, n)}
          emptyHint="No Co-ordinators yet. Add users with the Co-ordinator role in Admin → Users."
        />
        {!isBD && (
          <>
            <PeoplePicker
              label="Developers"
              candidates={devCandidates}
              selected={devs}
              onToggle={(n) => toggle(devs, setDevs, n)}
              emptyHint="No Developers yet. Add users with the Developer role in Admin → Users."
            />
            <PeoplePicker
              label="Business Developers"
              candidates={bdCandidates}
              selected={bds}
              onToggle={(n) => toggle(bds, setBds, n)}
              emptyHint="No Business Developers yet."
            />
          </>
        )}
      </div>

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
              startDate: start,
              targetDate: target,
              budgetHours: Number(budgetHours) || 0,
              description: description.trim(),
              health,
              leads,
              coordinators: coords,
              developers: devs,
              bds,
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
