"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle, Trash2 } from "lucide-react";
import { withinLogWindow, logWindowLabel } from "@/lib/domain";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { DomainTask } from "@/components/DomainTaskList";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainTeamLogs } from "@/components/DomainTeamLogs";
import { useDomain } from "@/lib/domain-store";

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
  // Admins see everyone; Leads see the people doing the work.
  const canSeeTeam = current?.role === "Admin" || current?.role === "Lead";
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [open, setOpen] = useState<boolean | null>(null);
  const [myTasks, setMyTasks] = useState<DomainTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Re-evaluate the window each minute so the form locks/unlocks live.
  useEffect(() => {
    setOpen(withinLogWindow());
    const id = setInterval(() => setOpen(withinLogWindow()), 60_000);
    return () => clearInterval(id);
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
    fetch("/api/domain/tasks?mine=true")
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((b) => setMyTasks(b.tasks ?? []))
      .catch(() => null);
    fetch("/api/domain/projects")
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
    setTaskId("");
    setProjectId("");
    setOk("Logged.");
    void loadLogs();
  }

  return (
    <DomainPage width={tab === "team" ? "wide" : "narrow"}>
      <PageHeader
        title="Work log"
        description={
          tab === "team"
            ? "What the team has logged. Filter by person and date range."
            : `Record what you did today. Entries are only accepted between ${logWindowLabel()}.`
        }
      />

      {canSeeTeam && (
        <div className="flex items-center gap-1 mb-5">
          <button
            onClick={() => setTab("mine")}
            className={`px-3 py-1.5 rounded text-sm font-medium ${
              tab === "mine"
                ? "bg-brand-blueBg text-brand-blue"
                : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            My log
          </button>
          <button
            onClick={() => setTab("team")}
            className={`px-3 py-1.5 rounded text-sm font-medium ${
              tab === "team"
                ? "bg-brand-blueBg text-brand-blue"
                : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            Team logs
          </button>
        </div>
      )}

      {tab === "team" && <DomainTeamLogs />}

      {tab === "mine" && (
        <>

      {open === false && (
        <div className="card p-4 mb-6 border-brand-yellowBorder bg-brand-yellowBg flex items-start gap-2">
          <AlertTriangle size={16} className="text-brand-yellow mt-0.5" />
          <p className="text-sm text-ink-700">
            It&apos;s outside the logging window ({logWindowLabel()}). You can
            log again once it reopens — entries can&apos;t be back-dated.
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
          className="w-full px-3 py-2 mb-3 rounded border border-ink-200 text-sm disabled:bg-ink-50"
        >
          <option value="">Which project did you work on?</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Task <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={!open}
              className="w-full px-3 py-2 rounded border border-ink-200 text-sm disabled:bg-ink-50"
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
              className="w-full px-3 py-2 rounded border border-ink-200 text-sm disabled:bg-ink-50"
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