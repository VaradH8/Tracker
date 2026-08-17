"use client";

import { useCallback, useEffect, useState } from "react";
import {
  worklogVisibleRoles,
  canAssignTasks,
  taskIsOpen,
} from "@/lib/domain";
import { DomainTaskList, type DomainTask } from "@/components/DomainTaskList";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainTeamLogs } from "@/components/DomainTeamLogs";
import { DomainTeamTasks } from "@/components/DomainTeamTasks";
import { DomainAssignTask } from "@/components/DomainAssignTask";
import { useDomain } from "@/lib/domain-store";
import { loadJson } from "@/lib/domain-fetch";

/**
 * Task log — what you owe, what you are owed, and what the team is doing.
 *
 * The "My hours" tab that used to live here is gone. The module plans and
 * reports in tags, not hours, so an hours form on the busiest screen was
 * asking people to keep a second set of books nothing read.
 */

type Tab = "tasks" | "review" | "teamTasks" | "team";

export default function TaskLogPage() {
  const { current } = useDomain();
  /**
   * Derived from the same rule the API enforces, so the tab appears
   * exactly when it would return something. Hard-coding Admin and Lead
   * here left Team Leads with no way to reach a view the server was
   * perfectly willing to serve them.
   */
  const canSeeTeam = current
    ? worklogVisibleRoles(current.role).length > 0
    : false;
  const canAssign = current ? canAssignTasks(current.role) : false;

  const [tab, setTab] = useState<Tab>("tasks");
  const [myTasks, setMyTasks] = useState<DomainTask[]>([]);
  const [toReview, setToReview] = useState<DomainTask[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const openTaskCount = myTasks.filter((t) => taskIsOpen(t.status)).length;

  const loadTasks = useCallback(() => {
    setLoadError(null);
    // Only the person who handed a task out reviews it, so the second
    // call is the caller's own queue rather than everything awaiting
    // review. A failure in either is shown rather than rendered as an
    // empty list — "no tasks" and "the server refused" must not look the
    // same on the screen people check for their work.
    Promise.all([
      loadJson<{ tasks: DomainTask[] }>("/api/domain/tasks?mine=true"),
      loadJson<{ tasks: DomainTask[] }>("/api/domain/tasks?review=true"),
    ])
      .then(([mine, review]) => {
        setMyTasks(mine.tasks ?? []);
        setToReview(review.tasks ?? []);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  /**
   * Load on mount as well as after every change.
   *
   * Previously the mount effect fetched only "my tasks" and left the
   * review queue empty until something happened to trigger a reload — so
   * a supervisor opening this page saw "To approve" with no count and an
   * empty panel while work genuinely sat waiting on them. One loader,
   * called in both places, is what stops the two drifting apart.
   */
  useEffect(loadTasks, [loadTasks]);

  return (
    <DomainPage width={tab === "team" || tab === "teamTasks" ? "wide" : "narrow"}>
      <PageHeader
        title="Task log"
        description={
          tab === "tasks"
            ? "Tasks assigned to you. Add a note and the day you did the work, then submit it for approval."
            : tab === "review"
              ? "Tasks you handed out that are waiting on your decision."
              : tab === "teamTasks"
                ? "Every task across the team — who assigned it, to whom, and where it stands."
                : "What the team has logged. Filter by person and date range."
        }
      />

      {loadError && (
        <div className="card p-3 mb-4 border-l-4 border-brand-red flex items-center justify-between gap-3">
          <p className="text-sm text-brand-redText">{loadError}</p>
          <button onClick={loadTasks} className="btn-ghost text-xs">
            Try again
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 mb-5 flex-wrap">
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>
          My tasks{openTaskCount > 0 ? ` (${openTaskCount})` : ""}
        </TabButton>
        {canAssign && (
          <TabButton active={tab === "review"} onClick={() => setTab("review")}>
            To approve{toReview.length > 0 ? ` (${toReview.length})` : ""}
          </TabButton>
        )}
        {canSeeTeam && (
          <TabButton
            active={tab === "teamTasks"}
            onClick={() => setTab("teamTasks")}
          >
            Team tasks
          </TabButton>
        )}
        {canSeeTeam && (
          <TabButton active={tab === "team"} onClick={() => setTab("team")}>
            Team logs
          </TabButton>
        )}
      </div>

      {/* Nothing loaded, so nothing is claimed. Rendering the list's
          "No tasks yet" under an error banner tells the reader two
          contradictory things at once. */}
      {tab === "tasks" && !loadError && (
        <>
          {canAssign && (
            <DomainAssignTask viewerId={current?.id} onCreated={loadTasks} />
          )}
          <DomainTaskList
            tasks={myTasks}
            canManage={false}
            viewerId={current?.id}
            viewerRole={current?.role}
            onChanged={loadTasks}
          />
        </>
      )}

      {tab === "review" && !loadError && (
        <DomainTaskList
          tasks={toReview}
          canManage={false}
          viewerId={current?.id}
          viewerRole={current?.role}
          onChanged={loadTasks}
        />
      )}

      {tab === "teamTasks" && (
        <DomainTeamTasks viewerId={current?.id} viewerRole={current?.role} />
      )}

      {tab === "team" && <DomainTeamLogs />}
    </DomainPage>
  );
}

/** One pill in the tab bar. Four of these hand-rolled inline was three
 *  too many. */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm font-medium ${
        active ? "bg-brand-blueBg text-brand-blue" : "text-ink-600 hover:bg-ink-100"
      }`}
    >
      {children}
    </button>
  );
}
