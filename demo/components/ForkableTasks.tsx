"use client";

import { useCallback, useEffect, useState } from "react";
import { GitFork, RefreshCw } from "lucide-react";
import { useTasks } from "@/lib/tasks-store";
import { useProjects } from "@/lib/projects-store";
import { useToast } from "@/components/Toast";
import type { Task } from "@/lib/mock";

const PRIORITY_STYLE: Record<string, string> = {
  High: "bg-brand-red/10 text-brand-red",
  Medium: "bg-brand-yellow/10 text-brand-yellow",
  Low: "bg-ink-100 text-ink-500",
};

/**
 * Read-only list of work on your projects that belongs to somebody else,
 * with a Fork button on each row.
 *
 * Kept apart from the board on purpose: /my-tasks stays "your work", and
 * this is the pool you can pull from. Forking copies the task to you and
 * leaves the original exactly as it was — the person holding it keeps it.
 */
export function ForkableTasks() {
  const { loadForkable, forkTask } = useTasks();
  const { projects } = useProjects();
  const toast = useToast();

  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await loadForkable());
    setLoading(false);
  }, [loadForkable]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectName = (id: number) =>
    projects.find((p) => p.id === id)?.name ?? "—";

  async function onFork(t: Task) {
    setForking(t.id);
    const r = await forkTask(t.id);
    setForking(null);
    if (r.ok) {
      toast.show(`Forked "${t.title}" — it's on your board now.`);
      // Drop it from the pool: it's mine now, so it's no longer forkable.
      setRows((prev) => prev.filter((x) => x.id !== t.id));
    } else {
      toast.show(r.error ?? "Couldn't fork that task.", "error");
    }
  }

  if (loading) {
    return (
      <section className="mt-10">
        <h2 className="font-heading text-lg font-semibold">Team tasks</h2>
        <p className="text-sm text-ink-400 mt-2">Loading…</p>
      </section>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-10">
      <header className="flex items-end justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-semibold">
            Team tasks you can fork
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            Work on your projects held by someone else. Forking takes your own
            copy — theirs is untouched.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="btn-ghost border border-ink-200 text-sm"
          title="Refresh the list"
        >
          <RefreshCw size={14} className="mr-1.5" /> Refresh
        </button>
      </header>

      <ul className="rounded-card border border-ink-200 divide-y divide-ink-100 bg-white">
        {rows.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 px-4 py-3 flex-wrap"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{t.title}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded ${
                    PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.Low
                  }`}
                >
                  {t.priority}
                </span>
                {t.forkedFromId && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">
                    already a fork
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-500 mt-0.5 truncate">
                {projectName(t.projectId)}
                {" · "}
                {t.assignees.length ? t.assignees.join(", ") : t.responsible || "unassigned"}
                {" · due "}
                {t.targetDate}
              </p>
            </div>
            <button
              onClick={() => void onFork(t)}
              disabled={forking === t.id}
              className="btn-ghost border border-ink-200 text-sm disabled:opacity-50"
              title="Take your own copy of this task"
            >
              <GitFork size={14} className="mr-1.5" />
              {forking === t.id ? "Forking…" : "Fork"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
