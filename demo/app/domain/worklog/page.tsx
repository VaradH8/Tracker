"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { withinLogWindow, logWindowLabel } from "@/lib/domain";
import type { DomainTask } from "@/components/DomainTaskList";

type WorkLog = {
  id: number;
  hours: number;
  note: string;
  date: string;
  task: string | null;
  createdAt: string;
};

export default function WorkLogPage() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [myTasks, setMyTasks] = useState<DomainTask[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
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

  useEffect(() => {
    void loadLogs();
    fetch("/api/domain/tasks?mine=true")
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((b) => setMyTasks(b.tasks ?? []))
      .catch(() => null);
  }, []);

  async function submit() {
    setError(null);
    setOk(null);
    const res = await fetch("/api/domain/worklogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    setOk("Logged.");
    void loadLogs();
  }

  return (
    <div className="max-w-[760px]">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Work log</h1>
        <p className="text-sm text-ink-500 mt-1">
          Record what you did today. Entries are only accepted between{" "}
          {logWindowLabel()}.
        </p>
      </header>

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
                  {l.task ? ` · ${l.task}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}