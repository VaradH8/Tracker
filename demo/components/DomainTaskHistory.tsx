"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Search, X } from "lucide-react";
import {
  DOMAIN_TASK_PRIORITIES,
  DOMAIN_TASK_STATUSES,
  type DomainTaskStatus,
} from "@/lib/domain";
import { dateClass, inputClass } from "@/lib/domain-ui";
import { DateInput } from "@/components/DateInput";
import { SearchSelect } from "@/components/SearchSelect";
import { DomainTaskCard, type TaskCardTask } from "@/components/DomainTaskCard";
import { useDomain } from "@/lib/domain-store";
import type { TaskSort } from "@/components/DomainSortToggle";

/**
 * Everything that has been assigned, and a way to find one of them.
 *
 * The other three tabs answer "what now": what is on me, what is waiting
 * on me, who do I give this to. None of them answers "what happened",
 * which is the question you have the moment you assign something and want
 * to check it went where you meant. Before this, a task you handed to
 * somebody else left your screen the second you pressed the button.
 *
 * Filtering runs on the server for the things that narrow the query —
 * scope, status, dates, person — and on the client for the text search,
 * which is instant and wants no round trip.
 */

type Scope = "byMe" | "toMe" | "both";
type Person = { id: string; name: string; role: string };

const SCOPES: { key: Scope; label: string; blank: string }[] = [
  {
    key: "byMe",
    label: "Assigned by me",
    blank: "You haven't handed any work out yet.",
  },
  {
    key: "toMe",
    label: "Assigned to me",
    blank: "Nothing has been assigned to you.",
  },
  { key: "both", label: "Everything of mine", blank: "Nothing here yet." },
];

/**
 * What this viewer can do with this row, on this screen.
 *
 * History mixes tasks the viewer owns with tasks they merely assigned or
 * happen to be able to see, so the card cannot infer it from the tab the
 * way the other three can. Mine to do, mine to decide, or mine to read.
 */
function standing(
  t: TaskCardTask,
  viewerId: string | undefined,
): { mode: "do" | "review"; readOnly: boolean } {
  if (viewerId && t.assigneeId === viewerId) return { mode: "do", readOnly: false };
  const isReviewer = (t.reviewers ?? []).some((r) => r.id === viewerId);
  if (isReviewer && t.status === "Submitted") {
    return { mode: "review", readOnly: false };
  }
  return { mode: "review", readOnly: true };
}

export function DomainTaskHistory({
  highlightId,
  sort,
}: {
  highlightId?: number;
  /** Owned by the page so History, My tasks and Task approval all agree. */
  sort: TaskSort;
}) {
  const { current } = useDomain();
  const [scope, setScope] = useState<Scope>("byMe");
  const [status, setStatus] = useState<DomainTaskStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [personId, setPersonId] = useState("");
  const [priority, setPriority] = useState("");
  const [text, setText] = useState("");

  const [rows, setRows] = useState<TaskCardTask[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/domain/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) => setPeople(b.users ?? []))
      .catch(() => null);
  }, []);

  const load = useCallback(() => {
    const q = new URLSearchParams({ scope, sort });
    if (status) q.set("status", status);
    if (priority) q.set("priority", priority);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    /**
     * The person box means different things either side of the scope. On
     * "assigned by me" you are asking who it went to; on "assigned to me"
     * you are asking who sent it. Same control, and the label below says
     * which, because two boxes for one question would be worse.
     */
    if (personId) {
      q.set(scope === "toMe" ? "createdById" : "assigneeId", personId);
    }
    return fetch(`/api/domain/tasks?${q}`, { cache: "no-store" })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Couldn't load the history.")),
      )
      .then((b) => {
        setRows(b.tasks ?? []);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [scope, status, priority, from, to, personId, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Title and note, matched as you type. No round trip for a substring. */
  const shown = useMemo(() => {
    const all = rows ?? [];
    const needle = text.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        (t.description ?? "").toLowerCase().includes(needle) ||
        (t.assignee ?? "").toLowerCase().includes(needle),
    );
  }, [rows, text]);

  const filtered = !!(status || priority || from || to || personId || text.trim());
  const peopleLabel = scope === "toMe" ? "From" : "To";

  function clearAll() {
    setStatus("");
    setPriority("");
    setFrom("");
    setTo("");
    setPersonId("");
    setText("");
  }

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <div className="flex items-center gap-1 flex-wrap">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-3 py-1.5 rounded-pill text-sm font-medium border ${
                scope === s.key
                  ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                  : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">Status</span>
            <SearchSelect
              value={status}
              onChange={(v) => setStatus(v as DomainTaskStatus | "")}
              placeholder="Any status"
              options={[
                { value: "", label: "Any status" },
                ...DOMAIN_TASK_STATUSES.map((s) => ({
                  value: s,
                  label: s === "Rejected" ? "Sent back" : s,
                })),
              ]}
            />
          </label>

          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">Priority</span>
            <SearchSelect
              value={priority}
              onChange={setPriority}
              placeholder="Any priority"
              options={[
                { value: "", label: "Any priority" },
                ...DOMAIN_TASK_PRIORITIES.map((p) => ({ value: p, label: p })),
              ]}
            />
          </label>

          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">
              {peopleLabel}
            </span>
            <SearchSelect
              value={personId}
              onChange={setPersonId}
              placeholder="Anyone"
              searchPlaceholder="Search people"
              options={[
                { value: "", label: "Anyone" },
                ...(current
                  ? [{ value: current.id, label: `Myself (${current.name})` }]
                  : []),
                ...people
                  .filter((p) => p.id !== current?.id)
                  .map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>

          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">
              Assigned from
            </span>
            <DateInput value={from} onChange={setFrom} className={dateClass("md")} />
          </label>

          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">
              Assigned to
            </span>
            <DateInput
              value={to}
              min={from || undefined}
              onChange={setTo}
              className={dateClass("md")}
            />
          </label>

          <label className="text-xs sm:col-span-2 lg:col-span-4">
            <span className="block text-ink-700 font-medium mb-1">Search</span>
            <span className="relative block">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
              />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Title, note or person"
                className={inputClass("md", "w-full pl-8")}
              />
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <p className="text-xs text-ink-500">
            Dates filter on when the task was assigned.
          </p>
          {filtered && (
            <button
              onClick={clearAll}
              className="text-xs text-brand-blue inline-flex items-center gap-1"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card p-3 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {rows === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="flex justify-center mb-2">
            <History size={20} className="text-ink-300" />
          </div>
          <p className="font-medium text-ink-700">
            {filtered ? "Nothing matches those filters" : "Nothing here yet"}
          </p>
          <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
            {filtered
              ? "Widen the dates or clear the filters to see the rest."
              : SCOPES.find((s) => s.key === scope)?.blank}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-500">
            {shown.length} task{shown.length === 1 ? "" : "s"}
            {filtered && rows.length !== shown.length && ` of ${rows.length}`}
          </p>
          <div className="grid gap-2">
            {shown.map((t) => (
              <div
                key={t.id}
                /* The task you just assigned, so the jump from the
                   confirmation lands on something you can see. */
                className={
                  t.id === highlightId
                    ? "rounded-lg ring-2 ring-brand-blue ring-offset-2"
                    : undefined
                }
              >
                <DomainTaskCard
                  t={t}
                  {...standing(t, current?.id)}
                  viewerId={current?.id}
                  onChanged={load}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
