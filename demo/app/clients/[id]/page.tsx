"use client";

import { use } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Mail,
  User,
  Calendar,
  Clock,
  FolderKanban,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { projectStatusPill } from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useProjects } from "@/lib/projects-store";
import { useToast } from "@/components/Toast";
import { useRole } from "@/lib/role";

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [role] = useRole();
  const {
    clients,
    projects: allProjects,
    hydrated,
    deleteClient,
  } = useProjects();
  const client = clients.find((c) => c.id === Number(id));
  if (hydrated && !client) notFound();

  const { tasks } = useTasks();
  const projects = allProjects.filter((p) => p.clientId === client?.id);
  const totalLogged = projects.reduce((s, p) => s + p.loggedHours, 0);
  const totalBudget = projects.reduce((s, p) => s + p.budgetHours, 0);
  const activeCount = projects.filter((p) => p.status === "Active").length;
  const delivered = projects.filter((p) => p.status === "Delivered").length;

  if (!client) {
    return (
      <AppShell>
        <div className="max-w-[1100px] mx-auto px-6 py-8">
          <p className="text-sm text-ink-500">Loading…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-blue mb-4"
        >
          <ArrowLeft size={14} /> All clients
        </Link>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-card bg-brand-blueBg text-brand-blue grid place-items-center shrink-0">
            <Building2 size={26} />
          </div>
          <div className="flex-1">
            <h1 className="font-heading text-3xl font-semibold">
              {client.name}
            </h1>
            <p className="text-sm text-ink-500 mt-1">{client.industry}</p>
          </div>
          {role === "Admin" && (
            <button
              onClick={async () => {
                if (
                  !confirm(
                    `Delete "${client.name}"? This client must have no projects attached.`,
                  )
                )
                  return;
                const r = await deleteClient(client.id);
                if (!r.ok) {
                  toast.show(r.error ?? "Couldn't delete client.", "error");
                  return;
                }
                toast.show(`Client "${client.name}" deleted.`, "info");
                router.push("/clients");
              }}
              className="btn-ghost border border-ink-200 text-brand-redText hover:bg-brand-redBg"
              title="Delete client"
            >
              <Trash2 size={16} className="mr-1.5" /> Delete
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <Stat label="Projects" value={projects.length} Icon={FolderKanban} />
          <Stat label="Active" value={activeCount} Icon={Calendar} tone="blue" />
          <Stat
            label="Delivered"
            value={delivered}
            Icon={CheckCircle2}
            tone="green"
          />
          <Stat
            label="Total hours"
            value={`${totalLogged}/${totalBudget}`}
            Icon={Clock}
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-4">
                Projects with this client
              </h2>
              {projects.length === 0 ? (
                <p className="text-sm text-ink-500 italic">
                  No projects yet for {client.name}.
                </p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {projects.map((p) => {
                    const open = tasks.filter(
                      (t) => t.projectId === p.id && t.status !== "Done",
                    ).length;
                    return (
                      <li key={p.id}>
                        <Link
                          href={`/projects/${p.id}`}
                          className="flex items-center gap-3 py-3 -mx-2 px-2 rounded hover:bg-ink-50 group"
                        >
                          <span className={projectStatusPill(p.status)}>
                            {p.status}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-ink-900 font-medium truncate group-hover:text-brand-blue">
                              {p.name}
                            </div>
                            <div className="text-xs text-ink-500">
                              {p.coordinator} · {open} open ·{" "}
                              {p.loggedHours}/{p.budgetHours}h
                            </div>
                          </div>
                          <ArrowRight
                            size={14}
                            className="text-ink-400 group-hover:text-brand-blue shrink-0"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <aside>
            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-4">
                Company
              </h2>
              <dl className="space-y-3 text-sm">
                <Row icon={<User size={14} />} label="Primary contact">
                  {client.primaryContact}
                </Row>
                <Row icon={<Mail size={14} />} label="Email">
                  <a
                    href={`mailto:${client.email}`}
                    className="text-brand-blue hover:underline break-all"
                  >
                    {client.email}
                  </a>
                </Row>
                <Row icon={<Building2 size={14} />} label="Industry">
                  {client.industry}
                </Row>
                <Row icon={<Calendar size={14} />} label="Client since">
                  {client.since}
                </Row>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  Icon: typeof Clock;
  tone?: "default" | "blue" | "green";
}) {
  const toneCls =
    tone === "blue"
      ? "text-brand-blue"
      : tone === "green"
        ? "text-brand-greenText"
        : "text-ink-900";
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-ink-500 font-medium mb-1">
        <Icon size={13} />
        {label}
      </div>
      <div className={`font-heading text-2xl font-semibold ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-ink-500 uppercase tracking-wide font-semibold mb-0.5">
        {icon}
        {label}
      </dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
  );
}
