"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, AlertTriangle, Trash2 } from "lucide-react";
import {
  withinLogWindow,
  logWindowLabel,
  istParts,
  backdateFloorISO,
  backdateWindowLabel,
  worklogVisibleRoles,
  canAssignTasks,
  taskIsOpen,
} from "@/lib/domain";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DomainTaskList, type DomainTask } from "@/components/DomainTaskList";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainTeamLogs } from "@/components/DomainTeamLogs";
import { DomainTeamTasks } from "@/components/DomainTeamTasks";
import { DomainAssignTask } from "@/components/DomainAssignTask";
import { useDomain } from "@/lib/domain-store";
import { inputClass, dateClass } from "@/lib/domain-ui";

type WorkLog = {
  id: number;
  hours: number;
  note: string;
  date: string;
  project: string | null;
  task: string | null;
  createdAt: string;
};

type Project = { id: number; name: string };

export default function WorkLogPage() {
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
  const [tab, setTab] = useState<
    "tasks" | "review" | "teamTasks" | "mine" | "team"
  >("tasks");
  const [open, setOpen] = useState<boolean | null>(null);
  const [myTasks, setMyTasks] = useState<DomainTask[]>([]);
  const [toReview, setToReview] = useState<DomainTask[]>([]);
  const canAssign = current ? canAssignTasks(current.role) : false;
  const openTaskCount = myTasks.filter((t) => taskIsOpen(t.status)).length;
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  /** The IST day this entry is for. Defaults to today; the picker is
   *  bounded so an entry can never be filed ahead of time or dug out of
   *  the distant past. */
  const todayISO = istParts().dateISO;
  const floorISO = backdateFloorISO();
  const [date, setDate] = useState(todayISO);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Re-evaluate the window each minute so the form locks/unlocks live.
  useEffect(() => {
    setOpen(withinLogWindow());
    const id = setInterval(() => setOpen(withinLogWindow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadTasks = useCallback(() => {
    fetch("/api/domain/tasks?mine=true", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((b) => setMyTasks(b.tasks ?? []))
      .catch(() => null);
    // Only the person who handed a task out reviews it, so this is the
    // caller's own queue rather than everything awaiting review.
    fetch("/api/domain/tasks?review=true", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((b) => setToReview(b.tasks ?? []))
      .catch(() => null);
  }, []);

  async function loadLogs() {
    const res = await fetch("/api/domain/worklogs", { cache: "no-store" });
    if (res.ok) setLogs((await res.json()).logs ?? []);
  }

  async function deleteLog(id: number) {
    const res = await fetch(`/api/domain/worklogs/${id}`, { method: "DELETE" });
    if (res.ok) void loadLogs();
  }

  useEffect(() => {
    void loadLogs();
    fetch("/api/domain/tasks?mine=true", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((b) => setMyTasks(b.tasks ?? []))
      .catch(() => null);
    fetch("/api/domain/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((b) => setProjects(b.projects ?? []))
      .catch(() => null);
  }, []);

  async function submit() {
    setError(null);
    setOk(null);
    const res = await fetch("/api/domain/worklogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectId || undefined,
        taskId: taskId || undefined,
        date,
        hours: Number(hours),
        note,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't save your log.");
      // Server is the source of truth on the window — reflect a lockout.
      if (res.status === 403) setOpen(false);
      return;
    }
    setHours("");
    setNote("");
    setDate(todayISO);
    setTaskId("");
    setProjectId("");
    setOk("Logged.");
    void loadLogs();
  }

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
              : tab === "team"
                ? "What the team has logged. Filter by person and date range."
                : `Record hours against a project. Entries are accepted between ${logWindowLabel()}, and can be dated ${backdateWindowLabel()}.`
        }
      />

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
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My hours
        </TabButton>
        {canSeeTeam && (
          <TabButton active={tab === "team"} onClick={() => setTab("team")}>
            Team logs
          </TabButton>
        )}
      </div>

      {tab === "tasks" && (
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

      {tab === "review" && (
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

      {tab === "mine" && (
        <>

      {open === false && (
        <div className="card p-4 mb-6 border-brand-yellowBorder bg-brand-yellowBg flex items-start gap-2">
          <AlertTriangle size={16} className="text-brand-yellow mt-0.5" />
          <p className="text-sm text-ink-700">
            It&apos;s outside the logging window ({logWindowLabel()}). You can
            log again once it reopens — including for days you missed,{" "}
            {backdateWindowLabel()}.
          </p>
        </div>
      )}

      <div className="card p-5 mb-8">
        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Project
        </label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={!open}
          className={inputClass("md", "w-full mb-3")}
        >
          <option value="">Which project did you work on?</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              min={floorISO}
              max={todayISO}
              onChange={(e) => setDate(e.target.value)}
              disabled={!open}
              className={dateClass("md", "w-full")}
            />
            {/* Only mention the limit once it matters — saying "you may
                back-date" on every entry invites it. */}
            {date !== todayISO && (
              <p className="text-[11px] text-brand-yellowText mt-1">
                Logging for an earlier day — allowed {backdateWindowLabel()}.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Task <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={!open}
              className={inputClass("md", "w-full")}
            >
              <option value="">General / no task</option>
              {myTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Hours
            </label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="14"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              disabled={!open}
              placeholder="e.g. 2.5"
              className={inputClass("md", "w-full")}
            />
          </div>
        </div>
        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          What did you do?
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!open}
          rows={2}
          placeholder="Short note on the work done"
          className="w-full px-3 py-2 rounded border border-ink-200 text-sm disabled:bg-ink-50 mb-3"
        />
        {error && <p className="text-xs text-brand-redText mb-2">{error}</p>}
        {ok && <p className="text-xs text-brand-greenText mb-2">{ok}</p>}
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!open || !hours || !note.trim()}
            className="btn-primary disabled:opacity-50"
          >
            <Clock size={16} className="mr-1.5" /> Log work
          </button>
        </div>
      </div>

      <h2 className="font-heading text-lg font-semibold mb-3">Your recent logs</h2>
      {logs.length === 0 ? (
        <p className="text-sm text-ink-400 italic">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="card p-3 flex items-start gap-3">
              <span className="text-sm font-heading font-semibold text-brand-blue w-16 shrink-0">
                {l.hours}h
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-900">{l.note}</div>
                <div className="text-xs text-ink-500 mt-0.5">
                  {l.date}
                  {l.project ? ` · ${l.project}` : ""}
                  {l.task ? ` · ${l.task}` : ""}
                </div>
              </div>
              <ConfirmButton
                onConfirm={() => deleteLog(l.id)}
                title="Delete this entry"
                className="p-1 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg shrink-0"
              >
                <Trash2 size={14} />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
        </>
      )}
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
