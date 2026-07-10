"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  AuditEntry,
  Priority,
  Status,
  Task,
  TaskAttachment,
  TimeEntry,
} from "./mock";

type AddTaskInput = {
  title: string;
  projectId: number;
  status: Status;
  priority?: Priority;
  description?: string;
  estimatedHours?: number | null;
  responsible?: string;
  assignees?: string[];
  targetDate?: string;
};

type LogTimeInput = {
  taskId: number;
  person: string;
  hours: number;
  date: string;
  note?: string;
};

export type ActiveTimer = {
  entryId: number;
  taskId: number;
  startedAt: string; // ISO
};

type Ctx = {
  tasks: Task[];
  timeEntries: TimeEntry[];
  auditLog: AuditEntry[];
  hydrated: boolean;
  activeTimer: ActiveTimer | null;
  startTimer: (taskId: number) => Promise<void>;
  stopTimer: (taskId: number) => Promise<void>;
  doneTimer: (taskId: number) => Promise<void>;
  refresh: () => Promise<void>;
  byId: (id: number) => Task | undefined;
  forProject: (projectId: number) => Task[];
  entriesForTask: (taskId: number) => TimeEntry[];
  setStatus: (id: number, status: Status) => Promise<void>;
  setPriority: (id: number, priority: Priority) => Promise<void>;
  setTargetDate: (id: number, date: string) => Promise<void>;
  setStartDate: (id: number, date: string) => Promise<void>;
  setDescription: (id: number, description: string) => Promise<void>;
  setAssignees: (id: number, names: string[]) => Promise<void>;
  toggleAssignee: (id: number, name: string) => Promise<void>;
  toggleImportant: (id: number) => Promise<void>;
  setEstimatedHours: (id: number, hours: number | null) => Promise<void>;
  toggleDependency: (id: number, depId: number) => Promise<void>;
  addAttachment: (
    id: number,
    file: File,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  removeAttachment: (id: number, attId: number) => Promise<void>;
  approveTask: (id: number, approver: string) => Promise<void>;
  unapproveTask: (id: number) => Promise<void>;
  addTask: (input: AddTaskInput) => Promise<{ ok: boolean; error?: string }>;
  deleteTask: (id: number) => Promise<{ ok: boolean; error?: string }>;
  addRemark: (taskId: number, author: string, body: string) => Promise<void>;
  deleteRemark: (taskId: number, remarkId: number) => Promise<void>;
  logTime: (input: LogTimeInput) => Promise<void>;
  deleteTimeEntry: (entryId: number) => Promise<void>;
  bulkReassign: (ids: number[], name: string) => Promise<void>;
  bulkSetTargetDate: (ids: number[], date: string) => Promise<void>;
};

const TasksCtx = createContext<Ctx | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [tRes, eRes, aRes, timerRes] = await Promise.all([
        fetch("/api/tasks", { cache: "no-store" }),
        fetch("/api/time-entries", { cache: "no-store" }),
        fetch("/api/audit", { cache: "no-store" }),
        fetch("/api/timer/active", { cache: "no-store" }),
      ]);
      if (tRes.ok) {
        const b = (await tRes.json()) as { tasks: Task[] };
        setTasks(b.tasks ?? []);
      } else setTasks([]);
      if (eRes.ok) {
        const b = (await eRes.json()) as { entries: TimeEntry[] };
        setTimeEntries(b.entries ?? []);
      } else setTimeEntries([]);
      if (aRes.ok) {
        const b = (await aRes.json()) as { entries: AuditEntry[] };
        setAuditLog(b.entries ?? []);
      } else setAuditLog([]);
      if (timerRes.ok) {
        const b = (await timerRes.json()) as { active: ActiveTimer | null };
        setActiveTimer(b.active);
      } else setActiveTimer(null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  function applyUpdatedTask(t: Task) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  }

  const byId = useCallback((id: number) => tasks.find((t) => t.id === id), [tasks]);
  const forProject = useCallback(
    (projectId: number) => tasks.filter((t) => t.projectId === projectId),
    [tasks],
  );
  const entriesForTask = useCallback(
    (taskId: number) =>
      timeEntries
        .filter((e) => e.taskId === taskId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [timeEntries],
  );

  async function patchTask(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (body.task) applyUpdatedTask(body.task as Task);
  }

  const setStatus = useCallback(
    (id: number, status: Status) => patchTask(id, { status }),
    [],
  );
  const setPriority = useCallback(
    (id: number, priority: Priority) => patchTask(id, { priority }),
    [],
  );
  const setTargetDate = useCallback(
    (id: number, date: string) => patchTask(id, { targetDate: date }),
    [],
  );
  const setStartDate = useCallback(
    (id: number, date: string) => patchTask(id, { startDate: date || null }),
    [],
  );
  const setDescription = useCallback(
    (id: number, description: string) => patchTask(id, { description }),
    [],
  );
  const setEstimatedHours = useCallback(
    (id: number, hours: number | null) =>
      patchTask(id, { estimatedHours: hours }),
    [],
  );
  const toggleImportant = useCallback(
    async (id: number) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      await patchTask(id, { important: !t.important });
    },
    [tasks],
  );

  const toggleAssignee = useCallback(
    async (id: number, name: string) => {
      const res = await fetch(`/api/tasks/${id}/assignees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action: "toggle" }),
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (Array.isArray(body.assignees)) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, assignees: body.assignees } : t,
          ),
        );
      }
    },
    [],
  );

  const setAssignees = useCallback(
    async (id: number, names: string[]) => {
      const current = tasks.find((t) => t.id === id);
      if (!current) return;
      const add = names.filter((n) => !current.assignees.includes(n));
      const remove = current.assignees.filter((n) => !names.includes(n));
      for (const name of [...add, ...remove]) {
        await fetch(`/api/tasks/${id}/assignees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, action: "toggle" }),
        });
      }
      // Refetch the task to settle final state.
      const res = await fetch(`/api/tasks/${id}`, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.task) applyUpdatedTask(body.task as Task);
      }
    },
    [tasks],
  );

  const toggleDependency = useCallback(
    async (id: number, depId: number) => {
      const res = await fetch(`/api/tasks/${id}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnId: depId }),
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (Array.isArray(body.dependsOn)) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, dependsOn: body.dependsOn } : t,
          ),
        );
      }
    },
    [],
  );

  const addAttachment = useCallback(
    async (
      id: number,
      file: File,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      // Real multipart upload — the server saves the bytes to its
      // /uploads volume and creates the DB row with a storageKey.
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/tasks/${id}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: body.error ?? "Couldn't upload that file.",
        };
      }
      const body = await res.json().catch(() => ({}));
      if (body.attachment) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  attachments: [
                    ...(t.attachments ?? []),
                    body.attachment as TaskAttachment,
                  ],
                }
              : t,
          ),
        );
      }
      return { ok: true };
    },
    [],
  );

  const removeAttachment = useCallback(
    async (id: number, attId: number) => {
      const res = await fetch(
        `/api/tasks/${id}/attachments/${attId}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                attachments: (t.attachments ?? []).filter(
                  (a) => a.id !== attId,
                ),
              }
            : t,
        ),
      );
    },
    [],
  );

  const approveTask = useCallback(async (id: number, _approver: string) => {
    const res = await fetch(`/api/tasks/${id}/approve`, { method: "POST" });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (body.task) applyUpdatedTask(body.task as Task);
  }, []);

  const unapproveTask = useCallback(async (id: number) => {
    const res = await fetch(`/api/tasks/${id}/approve`, { method: "DELETE" });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (body.task) applyUpdatedTask(body.task as Task);
  }, []);

  const deleteTask = useCallback(async (id: number) => {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Couldn't delete task." };
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setTimeEntries((prev) => prev.filter((e) => e.taskId !== id));
    return { ok: true };
  }, []);

  const deleteRemark = useCallback(
    async (taskId: number, remarkId: number) => {
      const res = await fetch(
        `/api/tasks/${taskId}/remarks/${remarkId}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                remarks: (t.remarks ?? []).filter((r) => r.id !== remarkId),
              }
            : t,
        ),
      );
    },
    [],
  );

  const deleteTimeEntry = useCallback(async (entryId: number) => {
    const entry = timeEntries.find((e) => e.id === entryId);
    const res = await fetch(`/api/time-entries/${entryId}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setTimeEntries((prev) => prev.filter((e) => e.id !== entryId));
    if (entry) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === entry.taskId
            ? {
                ...t,
                actualHours: Math.max(
                  0,
                  (t.actualHours ?? 0) - entry.hours,
                ),
              }
            : t,
        ),
      );
    }
  }, [timeEntries]);

  const addTask = useCallback(async (input: AddTaskInput) => {
    // Optimistic insert — the UI gets the new card the instant the user
    // clicks Create. The real id arrives a moment later when the server
    // responds; if it fails, we roll the optimistic row back out.
    const tempId = -Date.now();
    const today = new Date();
    const defaultTarget = new Date(
      today.getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    const optimistic: Task = {
      id: tempId,
      title: input.title,
      description: input.description,
      projectId: input.projectId,
      priority: input.priority ?? "Medium",
      status: input.status,
      responsible: input.responsible ?? "",
      assignees: input.assignees ?? [],
      targetDate: input.targetDate ?? defaultTarget,
      estimatedHours: input.estimatedHours ?? null,
      important: false,
    };
    setTasks((prev) => [optimistic, ...prev]);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Roll the optimistic card back out and hand the error to the
        // caller so it can show a toast instead of pretending it worked.
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        const error = body.error ?? res.statusText ?? "Couldn't create the task.";
        console.error("addTask failed:", error);
        return { ok: false, error };
      }
      const body = await res.json().catch(() => ({}));
      if (body.task) {
        setTasks((prev) =>
          prev.map((t) => (t.id === tempId ? (body.task as Task) : t)),
        );
        return { ok: true };
      }
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      return { ok: false, error: "The server didn't return the new task." };
    } catch (e) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      console.error("addTask network error:", e);
      return { ok: false, error: "Network error — check your connection and retry." };
    }
  }, []);

  const addRemark = useCallback(
    async (taskId: number, _author: string, body: string) => {
      const res = await fetch(`/api/tasks/${taskId}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data.remark) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, remarks: [...(t.remarks ?? []), data.remark] }
              : t,
          ),
        );
      }
    },
    [],
  );

  const logTime = useCallback(async (input: LogTimeInput) => {
    const res = await fetch(`/api/tasks/${input.taskId}/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hours: input.hours,
        date: input.date,
        note: input.note,
      }),
    });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (body.entry) {
      setTimeEntries((prev) => [body.entry as TimeEntry, ...prev]);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === input.taskId
            ? { ...t, actualHours: (t.actualHours ?? 0) + input.hours }
            : t,
        ),
      );
    }
  }, []);

  async function callTimer(
    taskId: number,
    action: "start" | "stop" | "done",
  ) {
    const res = await fetch(`/api/tasks/${taskId}/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (body.task) applyUpdatedTask(body.task as Task);
    // Refresh local active-timer state from the response (start) or
    // by re-fetching after a stop/done.
    if (action === "start" && body.activeStartedAt) {
      setActiveTimer({
        entryId: (body.entry as { id: number }).id,
        taskId,
        startedAt: body.activeStartedAt as string,
      });
    } else {
      const t = await fetch("/api/timer/active", { cache: "no-store" });
      if (t.ok) {
        const b = (await t.json()) as { active: ActiveTimer | null };
        setActiveTimer(b.active);
      }
    }
    // Refresh time-entries list so the new closed interval shows up
    // and actualHours reflects the latest.
    const eRes = await fetch("/api/time-entries", { cache: "no-store" });
    if (eRes.ok) {
      const b = (await eRes.json()) as { entries: TimeEntry[] };
      setTimeEntries(b.entries ?? []);
    }
  }

  const startTimer = useCallback(
    (taskId: number) => callTimer(taskId, "start"),
    [],
  );
  const stopTimer = useCallback(
    (taskId: number) => callTimer(taskId, "stop"),
    [],
  );
  const doneTimer = useCallback(
    (taskId: number) => callTimer(taskId, "done"),
    [],
  );

  const bulkReassign = useCallback(
    async (ids: number[], name: string) => {
      for (const id of ids) await setAssignees(id, [name]);
    },
    [setAssignees],
  );

  const bulkSetTargetDate = useCallback(async (ids: number[], date: string) => {
    for (const id of ids) await patchTask(id, { targetDate: date });
  }, []);

  return (
    <TasksCtx.Provider
      value={{
        tasks,
        timeEntries,
        auditLog,
        hydrated,
        activeTimer,
        startTimer,
        stopTimer,
        doneTimer,
        refresh,
        byId,
        forProject,
        entriesForTask,
        setStatus,
        setPriority,
        setTargetDate,
        setStartDate,
        setDescription,
        setAssignees,
        toggleAssignee,
        toggleImportant,
        setEstimatedHours,
        toggleDependency,
        addAttachment,
        removeAttachment,
        approveTask,
        unapproveTask,
        addTask,
        deleteTask,
        addRemark,
        deleteRemark,
        logTime,
        deleteTimeEntry,
        bulkReassign,
        bulkSetTargetDate,
      }}
    >
      {children}
    </TasksCtx.Provider>
  );
}

export function useTasks(): Ctx {
  const ctx = useContext(TasksCtx);
  if (!ctx) throw new Error("useTasks must be used within TasksProvider");
  return ctx;
}
