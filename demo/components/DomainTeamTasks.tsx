"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DOMAIN_ROLE_LABELS, normaliseTaskStatus, type DomainRole } from "@/lib/domain";
import { fmtDate } from "@/lib/domain-format";
import { dateClass, selectClass } from "@/lib/domain-ui";
import { DomainRefreshButton } from "@/components/DomainRefreshButton";
import { DomainTaskList, type DomainTask } from "@/components/DomainTaskList";

/**
 * Every task across the team, for the people entitled to read them.
 *
 * Tasks can be handed to anyone, so "who assigned what to whom" is not
 * something a hierarchy can be relied on to answer — an Admin has to be
 * able to see that Mr X gave something to Mr Y regardless of their
 * relative seniority. The filters exist because that list gets long fast.
 *
 * Scoping is enforced server-side; this view only asks, and the filters
 * narrow the result rather than widening it.
 */

type Person = { id: string; name: string; role: DomainRole };
type Project = { id: number; name: string };

export function DomainTeamTasks({
  viewerId,
  viewerRole,
}: {
  viewerId?: string;
  viewerRole?: DomainRole;
}) {
  const [tasks, setTasks] = useState<DomainTask[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [person, setPerson] = useState("all");
  const [project, setProject] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (person !== "all") qs.set("assigneeId", person);
    // "adhoc" is a real selection, not an id — the API understands it.
    if (project !== "all") qs.set("projectId", project);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    // Returned so the shared Refresh button can await it.
    return fetch(`/api/domain/tasks?${qs.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Team tasks are for Leads and Admins.");
        if (!r.ok) throw new Error(`Couldn't load tasks (HTTP ${r.status}).`);
        return r.json();
      })
      .then((b) => {
        setTasks(b.tasks ?? []);
        setError(null);
      })
      .catch((e: Error) => {
        setTasks([]);
        setError(e.message);
      });
  }, [person, project, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // The option lists come from an unfiltered read, so narrowing by one
  // filter doesn't empty the list you picked it from.
  useEffect(() => {
    fetch("/api/domain/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) => setPeople(b.users ?? []))
      .catch(() => null);
    fetch("/api/domain/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((b) => setProjects(b.projects ?? []))
      .catch(() => null);
  }, []);

  const shown = useMemo(
    () =>
      status === "all"
        ? (tasks ?? [])
        : (tasks ?? []).filter((t) => normaliseTaskStatus(t.status) === status),
    [tasks, status],
  );

  const filtered = person !== "all" || project !== "all" || !!from || !!to || status !== "all";

  return (
    <div>
      <div className="card p-4 mb-4 flex items-end gap-3 flex-wrap">
        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Person</span>
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className={selectClass("md", "min-w-[180px]")}
          >
            <option value="all">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {DOMAIN_ROLE_LABELS[p.role] ?? p.role}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Project</span>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className={selectClass("md", "min-w-[170px]")}
          >
            <option value="all">All projects</option>
            <option value="adhoc">Ad hoc — no project</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClass("md")}
          >
            <option value="all">Any status</option>
            <option value="Assigned">Assigned</option>
            <option value="Submitted">Awaiting approval</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Sent back</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Assigned from</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={dateClass("md")}
          />
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={dateClass("md")}
          />
        </label>
        {filtered && (
          <button
            onClick={() => {
              setPerson("all");
              setProject("all");
              setStatus("all");
              setFrom("");
              setTo("");
            }}
            className="btn-ghost text-sm"
          >
            Clear
          </button>
        )}
        <span className="ml-auto">
          <DomainRefreshButton onRefresh={load} />
        </span>
      </div>

      {error && (
        <div className="card p-4 mb-4 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {tasks === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <>
          <p className="text-xs text-ink-500 mb-3">
            {shown.length} task{shown.length === 1 ? "" : "s"}
            {filtered && " matching these filters"}
            {from || to ? ` · assigned ${fmtDate(from || null)} – ${fmtDate(to || null)}` : ""}
          </p>
          {shown.length === 0 ? (
            <p className="text-sm text-ink-400 italic py-4 text-center">
              {filtered ? "Nothing matches those filters." : "No tasks yet."}
            </p>
          ) : (
            <DomainTaskList
              tasks={shown}
              canManage={false}
              viewerId={viewerId}
              viewerRole={viewerRole}
              onChanged={load}
            />
          )}
        </>
      )}
    </div>
  );
}
