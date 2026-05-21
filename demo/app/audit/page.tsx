"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Search, Download, ChevronDown, ChevronUp, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useToast } from "@/components/Toast";
import { useTasks } from "@/lib/tasks-store";
import { daysSince } from "@/lib/mock";

const ACTION_LABELS: Record<string, string> = {
  "task.status_change": "Status changed",
  "task.mark_important": "Marked Important",
  "task.reassign": "Reassigned",
  "task.responsible_change": "Responsible changed",
  "task.create": "Task created",
  "project.create": "Project created",
  "user.invite": "User invited",
  "user.role_change": "Role changed",
};

/** Entity type = the prefix of the action id (task / project / user). */
function entityOf(action: string): string {
  return action.split(".")[0] ?? "other";
}

type Window = "all" | "24h" | "7d";

export default function AuditPage() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("All");
  const [entity, setEntity] = useState("All");
  const [action, setAction] = useState("All");
  const [win, setWin] = useState<Window>("all");
  const toast = useToast();
  const { auditLog } = useTasks();

  // Honour /audit?actor=Name deep links from the Users page.
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("actor");
    if (a) setActor(a);
  }, []);

  const actors = useMemo(
    () => ["All", ...Array.from(new Set(auditLog.map((e) => e.actor)))],
    [auditLog],
  );
  const entities = useMemo(
    () =>
      ["All", ...Array.from(new Set(auditLog.map((e) => entityOf(e.action))))],
    [auditLog],
  );
  const actions = useMemo(
    () => ["All", ...Array.from(new Set(auditLog.map((e) => e.action)))],
    [auditLog],
  );

  const rows = auditLog
    .filter((e) => actor === "All" || e.actor === actor)
    .filter((e) => entity === "All" || entityOf(e.action) === entity)
    .filter((e) => action === "All" || e.action === action)
    .filter((e) => {
      if (win === "all") return true;
      const d = daysSince(e.when);
      return win === "24h" ? d < 1 : d <= 7;
    })
    .filter((e) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        e.actor.toLowerCase().includes(q) ||
        e.scope.toLowerCase().includes(q) ||
        (e.taskTitle ?? "").toLowerCase().includes(q) ||
        (ACTION_LABELS[e.action] ?? e.action).toLowerCase().includes(q)
      );
    });

  const filtersOn =
    actor !== "All" ||
    entity !== "All" ||
    action !== "All" ||
    win !== "all" ||
    query.trim() !== "";

  function clearFilters() {
    setActor("All");
    setEntity("All");
    setAction("All");
    setWin("all");
    setQuery("");
  }

  function exportCsv() {
    const csv = toCsv(
      ["When", "Who", "Action", "Entity", "Where", "Target", "Before", "After"],
      rows.map((e) => [
        e.when,
        e.actor,
        ACTION_LABELS[e.action] ?? e.action,
        entityOf(e.action),
        e.scope,
        e.taskTitle ?? "",
        e.before ?? "",
        e.after ?? "",
      ]),
    );
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.show(`Exported ${rows.length} audit entries to CSV.`);
  }

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Audit log</h1>
            <p className="text-sm text-ink-500 mt-1">
              {rows.length} of {auditLog.length}{" "}
              {auditLog.length === 1 ? "entry" : "entries"} · every change,
              every actor
            </p>
          </div>
          <button onClick={exportCsv} className="btn-ghost border border-ink-200">
            <Download size={16} className="mr-1.5" /> Export CSV
          </button>
        </div>

        <div className="card p-3 mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search audit log…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="px-3 py-1.5 rounded border border-ink-200 text-sm"
          >
            {actors.map((a) => (
              <option key={a} value={a}>
                {a === "All" ? "All actors" : a}
              </option>
            ))}
          </select>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="px-3 py-1.5 rounded border border-ink-200 text-sm capitalize"
          >
            {entities.map((a) => (
              <option key={a} value={a}>
                {a === "All" ? "All entities" : a}
              </option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-3 py-1.5 rounded border border-ink-200 text-sm"
          >
            {actions.map((a) => (
              <option key={a} value={a}>
                {a === "All" ? "All actions" : (ACTION_LABELS[a] ?? a)}
              </option>
            ))}
          </select>
          <select
            value={win}
            onChange={(e) => setWin(e.target.value as Window)}
            className="px-3 py-1.5 rounded border border-ink-200 text-sm"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="24h">Last 24 hours</option>
          </select>
          {filtersOn && (
            <button
              onClick={clearFilters}
              className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 px-1"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            Icon={Search}
            title="No audit entries match"
            message="Nothing recorded for these filters. Try widening the time window or clearing filters."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200 bg-ink-50">
                  <th className="py-3 px-5 w-32">When</th>
                  <th className="py-3 px-3">Who</th>
                  <th className="py-3 px-3">What</th>
                  <th className="py-3 px-3">Where</th>
                  <th className="py-3 px-3">Target</th>
                  <th className="py-3 px-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() =>
                        setExpanded(expanded === e.id ? null : e.id)
                      }
                      className="border-b border-ink-100 hover:bg-ink-50 cursor-pointer"
                    >
                      <td className="py-3 px-5 text-ink-500 font-mono text-xs">
                        {e.when}
                      </td>
                      <td className="py-3 px-3 text-ink-700">{e.actor}</td>
                      <td className="py-3 px-3">
                        <span className="text-ink-900 font-medium">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </span>
                        <code className="ml-2 text-[10px] font-mono text-ink-400">
                          {e.action}
                        </code>
                      </td>
                      <td className="py-3 px-3 text-ink-700">{e.scope}</td>
                      <td className="py-3 px-3 text-ink-900 max-w-[280px] truncate">
                        {e.taskTitle ?? "—"}
                      </td>
                      <td className="py-3 px-3 text-ink-400">
                        {e.before || e.after ? (
                          expanded === e.id ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : null}
                      </td>
                    </tr>
                    {expanded === e.id && (e.before || e.after) && (
                      <tr className="border-b border-ink-100 bg-ink-50">
                        <td colSpan={6} className="px-5 py-3">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <div className="text-ink-500 font-semibold uppercase tracking-wide mb-1">
                                Before
                              </div>
                              <pre className="bg-brand-redBg text-brand-redText p-2 rounded text-[11px] whitespace-pre-wrap">
                                {e.before ?? "—"}
                              </pre>
                            </div>
                            <div>
                              <div className="text-ink-500 font-semibold uppercase tracking-wide mb-1">
                                After
                              </div>
                              <pre className="bg-brand-greenBg text-brand-greenText p-2 rounded text-[11px] whitespace-pre-wrap">
                                {e.after ?? "—"}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
