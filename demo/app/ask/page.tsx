"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessagesSquare,
  Send,
  ArrowRight,
  AlertTriangle,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useTaskDrawer } from "@/components/TaskDrawerProvider";
import type {
  AskAnswer,
  AskLeaveRow,
  AskPersonRow,
  AskProjectRow,
  AskTaskRow,
} from "@/lib/ask/answer";

/* ------------------------------------------------------------------ */
/* Transcript state                                                    */
/* ------------------------------------------------------------------ */

/** Session-only by design: the transcript lives in component state and is
 *  gone on reload. Nothing about a question is written to the database,
 *  so there's no new store of "who asked what about whom". */
type Turn =
  | { id: number; role: "you"; text: string }
  | { id: number; role: "tracker"; answer: AskAnswer }
  | { id: number; role: "error"; text: string };

let nextId = 1;

/* ------------------------------------------------------------------ */
/* Small presentational bits                                           */
/* ------------------------------------------------------------------ */

const PRIORITY_DOT: Record<string, string> = {
  Critical: "bg-brand-red",
  High: "bg-brand-yellow",
  Medium: "bg-brand-blue",
  Low: "bg-ink-400",
};

const HEALTH_DOT: Record<string, string> = {
  green: "bg-brand-green",
  yellow: "bg-brand-yellow",
  red: "bg-brand-red",
};

function TaskRow({ task, onOpen }: { task: AskTaskRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-start gap-3 px-3 py-2 rounded hover:bg-ink-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          PRIORITY_DOT[task.priority] ?? "bg-ink-400"
        }`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink-900">
            {task.title}
          </span>
          {task.important && (
            <span className="pill-yellow shrink-0">Important</span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
          <span>{task.projectName}</span>
          <span aria-hidden>·</span>
          <span>{task.status}</span>
          {task.assignees.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{task.assignees.join(", ")}</span>
            </>
          )}
          {task.targetDate && (
            <>
              <span aria-hidden>·</span>
              <span>due {task.targetDate}</span>
            </>
          )}
        </span>
      </span>
      {task.overdueDays ? (
        <span className="pill-red shrink-0">{task.overdueDays}d late</span>
      ) : null}
    </button>
  );
}

function PersonRow({ person }: { person: AskPersonRow }) {
  const over =
    person.capacityPerWeek > 0 && person.estimatedHours > person.capacityPerWeek;
  const pct =
    person.capacityPerWeek > 0
      ? Math.min(100, Math.round((person.estimatedHours / person.capacityPerWeek) * 100))
      : 0;
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">
          {person.name}
        </span>
        <span className="text-xs text-ink-500">
          {person.role} · {person.open} open
          {person.overdue > 0 && ` · ${person.overdue} overdue`}
          {person.dueToday > 0 && ` · ${person.dueToday} due today`}
        </span>
      </span>
      {person.capacityPerWeek > 0 && (
        <span className="w-32 shrink-0">
          <span className="block h-1.5 w-full rounded-pill bg-ink-100">
            <span
              className={`block h-1.5 rounded-pill ${
                over ? "bg-brand-red" : "bg-brand-blue"
              }`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span
            className={`mt-1 block text-right text-xs ${
              over ? "text-brand-redText" : "text-ink-500"
            }`}
          >
            {person.estimatedHours}h / {person.capacityPerWeek}h
          </span>
        </span>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: AskProjectRow }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-ink-50 transition-colors"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          HEALTH_DOT[project.health] ?? "bg-ink-400"
        }`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">
          {project.name}
        </span>
        <span className="text-xs text-ink-500">
          {project.clientName} · {project.status} · {project.progress}% ·{" "}
          {project.open} open
          {project.overdue > 0 && ` · ${project.overdue} overdue`}
        </span>
      </span>
      <span className="shrink-0 text-xs text-ink-400">{project.targetDate}</span>
    </Link>
  );
}

function LeaveRow({ leave }: { leave: AskLeaveRow }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <CalendarDays className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">
          {leave.name}
        </span>
        <span className="text-xs text-ink-500">
          {leave.type} · {leave.start}
          {leave.end !== leave.start && ` → ${leave.end}`}
        </span>
      </span>
      <span className={leave.approved ? "pill-green" : "pill-yellow"}>
        {leave.approved ? "Approved" : "Pending"}
      </span>
    </div>
  );
}

function AnswerCard({
  answer,
  onAsk,
  onOpenTask,
}: {
  answer: AskAnswer;
  onAsk: (q: string) => void;
  onOpenTask: (id: number) => void;
}) {
  const hasRows =
    (answer.tasks?.length ?? 0) +
      (answer.people?.length ?? 0) +
      (answer.projects?.length ?? 0) +
      (answer.leaves?.length ?? 0) >
    0;

  return (
    <div className="card max-w-[46rem] p-4">
      <p className="font-heading text-base font-semibold leading-snug text-ink-900">
        {answer.headline}
      </p>
      {answer.detail && (
        <p className="mt-1 text-sm text-ink-500">{answer.detail}</p>
      )}

      {hasRows && (
        <div className="mt-3 divide-y divide-ink-100 rounded border border-ink-200">
          {answer.tasks?.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />
          ))}
          {answer.people?.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
          {answer.projects?.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
          {answer.leaves?.map((l) => (
            <LeaveRow key={l.id} leave={l} />
          ))}
        </div>
      )}

      {answer.suggestions && answer.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {answer.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAsk(s)}
              className="pill-grey hover:bg-ink-200 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {(answer.link || answer.understood) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
          {answer.understood ? (
            <span className="text-xs text-ink-400">
              Read as: {answer.understood}
            </span>
          ) : (
            <span />
          )}
          {answer.link && (
            <Link
              href={answer.link.href}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
            >
              {answer.link.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [starters, setStarters] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const drawer = useTaskDrawer();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ask", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.suggestions) setStarters(d.suggestions.slice(0, 6));
      })
      .catch(() => {
        /* starters are a nicety — the input works without them */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setBusy(true);
    setTurns((prev) => [...prev, { id: nextId++, role: "you", text: q }]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTurns((prev) => [
          ...prev,
          {
            id: nextId++,
            role: "error",
            text: data.error ?? "Something went wrong. Try again.",
          },
        ]);
      } else {
        setTurns((prev) => [
          ...prev,
          { id: nextId++, role: "tracker", answer: data.answer as AskAnswer },
        ]);
      }
    } catch {
      setTurns((prev) => [
        ...prev,
        { id: nextId++, role: "error", text: "Couldn't reach the server." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-full max-w-[1200px] flex-col px-6 py-8">
        <header className="mb-6 shrink-0">
          <h1 className="font-heading text-3xl font-semibold">Ask Tracker</h1>
          <p className="mt-1 text-sm text-ink-500">
            Ask about tasks, workload, projects, blockers, leave and sign-offs.
            Answers are read straight from the tracker and scoped to what you
            can already see.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {turns.length === 0 ? (
            <div className="card max-w-[46rem] p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-blueBg">
                  <MessagesSquare
                    className="h-5 w-5 text-brand-blue"
                    aria-hidden
                  />
                </span>
                <div>
                  <p className="font-heading text-base font-semibold">
                    What do you want to know?
                  </p>
                  <p className="mt-1 text-sm text-ink-500">
                    Type a question in your own words — &ldquo;what are Varad&rsquo;s
                    tasks today?&rdquo;. Nothing you ask is stored or sent
                    anywhere; the chat clears when you leave the page.
                  </p>
                </div>
              </div>
              {starters.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="pill-grey hover:bg-ink-200 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {turns.map((turn) => {
                if (turn.role === "you") {
                  return (
                    <div key={turn.id} className="flex justify-end">
                      <p className="max-w-[36rem] rounded-card rounded-br-sm bg-brand-blue px-4 py-2 text-sm text-white">
                        {turn.text}
                      </p>
                    </div>
                  );
                }
                if (turn.role === "error") {
                  return (
                    <div
                      key={turn.id}
                      className="flex max-w-[46rem] items-start gap-2 rounded-card border border-brand-yellowBorder bg-brand-yellowBg px-4 py-3"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellowText"
                        aria-hidden
                      />
                      <p className="text-sm text-brand-yellowText">{turn.text}</p>
                    </div>
                  );
                }
                return (
                  <AnswerCard
                    key={turn.id}
                    answer={turn.answer}
                    onAsk={ask}
                    onOpenTask={(id) => drawer.open(id)}
                  />
                );
              })}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-ink-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Looking it up…
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form
          className="shrink-0 border-t border-ink-200 bg-ink-50 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What are Varad's tasks today?"
              aria-label="Ask a question"
              autoFocus
              className="flex-1 rounded border border-ink-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand-blue focus:ring-2 focus:ring-brand-blueBg"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="btn-primary gap-2"
            >
              <Send className="h-4 w-4" aria-hidden />
              Ask
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Read-only. Ask Tracker never changes anything — and it can only see
            the projects and people you already have access to.
          </p>
        </form>
      </div>
    </AppShell>
  );
}
