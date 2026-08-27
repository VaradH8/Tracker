"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare, ClipboardList, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainRefreshButton } from "@/components/DomainRefreshButton";
import { DomainAssignTask } from "@/components/DomainAssignTask";
import { DomainTaskCard, type TaskCardTask } from "@/components/DomainTaskCard";
import { DomainTaskHistory } from "@/components/DomainTaskHistory";
import { useDomain } from "@/lib/domain-store";

/**
 * The task log: three questions, three tabs.
 *
 *   Assign task    — hand work over, to anybody including yourself
 *   My tasks       — what is on you, and the box to say it is done
 *   Task approval  — what is waiting on your decision
 *
 * Tabs rather than one long page because the three are used by different
 * people at different moments: somebody clearing an approval queue is not
 * also assigning work, and a page that showed both would bury whichever
 * they came for.
 *
 * The counts live on the tabs. "Task approval" with nothing next to it is
 * a tab nobody opens; with a 3 on it, it is the reason they came.
 */

type Tab = "assign" | "mine" | "approve" | "history";

export default function DomainTaskLogPage() {
  const { current } = useDomain();
  const params = useSearchParams();
  /**
   * ?tab= lets other screens link straight to the right one — the
   * dashboard card comes in on "mine", and the assign confirmation jumps
   * to "history" with the new task's id so it can be picked out.
   */
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return t === "assign" || t === "approve" || t === "history" ? t : "mine";
  });
  const [highlightId, setHighlightId] = useState<number | undefined>();
  const [mine, setMine] = useState<TaskCardTask[] | null>(null);
  const [toReview, setToReview] = useState<TaskCardTask[]>([]);
  /** Named me a reviewer but not submitted yet — so being put on the hook
   *  is visible from the moment it happens, not weeks later. */
  const [coming, setComing] = useState<TaskCardTask[]>([]);
  /** Work I handed out that has come back, whoever decides it. */
  const [backToMe, setBackToMe] = useState<TaskCardTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Finished work, folded away — see the toggle below. */
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      fetch("/api/domain/tasks?mine=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Couldn't load your tasks.")),
      ),
      fetch("/api/domain/tasks?review=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { tasks: [] },
      ),
      fetch("/api/domain/tasks?reviewing=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { tasks: [] },
      ),
      fetch("/api/domain/tasks?submittedToMe=true", { cache: "no-store" }).then(
        (r) => (r.ok ? r.json() : { tasks: [] }),
      ),
    ])
      .then(([m, r, rv, back]) => {
        setMine(m.tasks ?? []);
        setToReview(r.tasks ?? []);
        // Everything naming me, minus the ones already in the queue above.
        setComing(
          (rv.tasks ?? []).filter(
            (t: TaskCardTask) => t.status === "Assigned" || t.status === "Rejected",
          ),
        );
        // Only where somebody else decides — otherwise it is the queue.
        setBackToMe(
          (back.tasks ?? []).filter(
            (t: TaskCardTask) =>
              !(t.reviewers ?? []).some((x) => x.id === current?.id),
          ),
        );
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [current?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = mine ?? [];
  const open = rows.filter((t) => t.status === "Assigned" || t.status === "Rejected");
  const waiting = rows.filter((t) => t.status === "Submitted");
  const done = rows.filter((t) => t.status === "Approved");

  /**
   * The badge counts what you can act on, not what is on the page.
   *
   * "Coming to you" and "Submitted on tasks you assigned" are worth
   * seeing and are nothing to do, so folding them into the number would
   * teach people that the badge lies. `quiet` marks the tab instead — a
   * dot, not a number.
   */
  const TABS: { key: Tab; label: string; count?: number; quiet?: boolean }[] = [
    { key: "assign", label: "Assign task" },
    { key: "mine", label: "My tasks", count: open.length },
    {
      key: "approve",
      label: "Task approval",
      count: toReview.length,
      quiet: toReview.length === 0 && coming.length + backToMe.length > 0,
    },
    { key: "history", label: "History" },
  ];

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Task log"
        description="Hand work over, get on with what's yours, and sign off what's waiting on you."
        actions={<DomainRefreshButton onRefresh={load} />}
      />

      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-pill text-sm font-medium border ${
              tab === t.key
                ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 ? (
              <span
                className={`ml-1.5 px-1.5 rounded-pill text-[11px] ${
                  tab === t.key ? "bg-brand-blue text-white" : "bg-ink-100 text-ink-600"
                }`}
              >
                {t.count}
              </span>
            ) : t.quiet ? (
              <span
                title="Something to look at, nothing to do"
                className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-ink-300 align-middle"
              />
            ) : null}
          </button>
        ))}
      </div>

      {error && (
        <div className="card p-3 border-l-4 border-brand-red mb-4">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {tab === "assign" && (
        <DomainAssignTask
          onCreated={load}
          onOpenHistory={(id) => {
            setHighlightId(id);
            setTab("history");
          }}
        />
      )}

      {tab === "history" && <DomainTaskHistory highlightId={highlightId} />}

      {tab === "mine" &&
        (mine === null ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <Empty
            icon={<ClipboardList size={20} className="text-ink-300" />}
            title="Nothing on you"
            body="Work assigned to you turns up here. You can also give yourself a task from Assign task."
          />
        ) : (
          <div className="grid gap-5">
            <Section
              title="To do"
              count={open.length}
              empty="Nothing outstanding."
              tasks={open}
              mode="do"
              viewerId={current?.id}
              onChanged={load}
            />
            {waiting.length > 0 && (
              <Section
                title="Waiting on a reviewer"
                count={waiting.length}
                empty=""
                tasks={waiting}
                mode="do"
                onChanged={load}
              />
            )}
            {/* Folded away by default: finished work is a record, and it
                would otherwise push what is outstanding off the screen. */}
            {done.length > 0 && (
              <section>
                <button
                  onClick={() => setShowDone((v) => !v)}
                  className="text-sm text-brand-blue"
                >
                  {showDone ? "Hide" : "Show"} {done.length} finished
                </button>
                {showDone && (
                  <div className="grid gap-2 mt-3">
                    {done.map((t) => (
                      <DomainTaskCard key={t.id} t={t} mode="do" viewerId={current?.id} onChanged={load} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        ))}

      {tab === "approve" &&
        (toReview.length === 0 && coming.length === 0 && backToMe.length === 0 ? (
          <Empty
            icon={<CheckSquare size={20} className="text-ink-300" />}
            title="Nothing waiting on you"
            body="Tasks you're named to review turn up here — as soon as you're named, and again when the work comes back."
          />
        ) : (
          <div className="grid gap-5">
            {toReview.length > 0 && (
              <section>
                <h2 className="font-heading text-lg font-semibold mb-1">
                  Waiting on your decision
                  <span className="text-ink-400 font-normal text-sm">
                    {" "}
                    ({toReview.length})
                  </span>
                </h2>
                <p className="text-sm text-ink-500 mb-3">
                  Approving closes the task; sending it back returns it to be
                  redone.
                </p>
                <div className="grid gap-2">
                  {toReview.map((t) => (
                    <DomainTaskCard
                      key={t.id}
                      t={t}
                      mode="review"
                      viewerId={current?.id}
                      onChanged={load}
                    />
                  ))}
                </div>
              </section>
            )}

            {/*
              Named, but the work has not landed yet.

              This is the half that was missing. Being made a reviewer used
              to be silent: nothing appeared anywhere until the assignee
              submitted, which could be a fortnight later, so the first a
              reviewer knew of it was a task in their queue with no warning
              it was coming. Read-only, because there is nothing to decide
              yet — but visible, because being on the hook is worth knowing.
            */}
            {coming.length > 0 && (
              <section>
                <h2 className="font-heading text-lg font-semibold mb-1">
                  Coming to you
                  <span className="text-ink-400 font-normal text-sm">
                    {" "}
                    ({coming.length})
                  </span>
                </h2>
                <p className="text-sm text-ink-500 mb-3">
                  You&apos;re named to review these. Nothing to do until
                  they&apos;re submitted.
                </p>
                <div className="grid gap-2">
                  {coming.map((t) => (
                    <DomainTaskCard
                      key={t.id}
                      t={t}
                      mode="review"
                      viewerId={current?.id}
                      readOnly
                      onChanged={load}
                    />
                  ))}
                </div>
              </section>
            )}

            {/*
              Work you handed out that has come back, where somebody else
              decides. Naming a reviewer hands over the decision, not the
              interest — before this, an assigner had no way of learning
              their task had even been submitted.
            */}
            {backToMe.length > 0 && (
              <section>
                <h2 className="font-heading text-lg font-semibold mb-1">
                  Submitted on tasks you assigned
                  <span className="text-ink-400 font-normal text-sm">
                    {" "}
                    ({backToMe.length})
                  </span>
                </h2>
                <p className="text-sm text-ink-500 mb-3">
                  For your information — these are somebody else&apos;s to
                  approve.
                </p>
                <div className="grid gap-2">
                  {backToMe.map((t) => (
                    <DomainTaskCard
                      key={t.id}
                      t={t}
                      mode="review"
                      viewerId={current?.id}
                      readOnly
                      onChanged={load}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        ))}
    </DomainPage>
  );
}

function Section({
  title,
  count,
  empty,
  tasks,
  mode,
  viewerId,
  onChanged,
}: {
  title: string;
  count: number;
  empty: string;
  tasks: TaskCardTask[];
  mode: "do" | "review";
  viewerId?: string;
  onChanged: () => void;
}) {
  return (
    <section>
      <h2 className="font-heading text-lg font-semibold mb-3">
        {title}
        {count > 0 && (
          <span className="text-ink-400 font-normal text-sm"> ({count})</span>
        )}
      </h2>
      {tasks.length === 0 ? (
        empty ? (
          <p className="text-sm text-ink-400 italic">{empty}</p>
        ) : null
      ) : (
        <div className="grid gap-2">
          {tasks.map((t) => (
            <DomainTaskCard key={t.id} t={t} mode={mode} viewerId={viewerId} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card p-10 text-center">
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="font-medium text-ink-700">{title}</p>
      <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">{body}</p>
    </div>
  );
}
