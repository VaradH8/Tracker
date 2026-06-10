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

type Ctx = {
  tasks: Task[];
  timeEntries: TimeEntry[];
  auditLog: AuditEntry[];
  hydrated: boolean;
  refresh: () => Promise<void>;
  byId: (id: number) => Task | undefined;
  forProject: (projectId: number) => Task[];
  entriesForTask: (taskId: number) => TimeEntry[];
  setStatus: (id: number, status: Status) => Promise<void>;
  setPriority: (id: number, priority: Priority) => Promise<void>;
  setTargetDate: (id: number, date: string) => Promise<void>;
  setDescription: (id: number, description: string) => Promise<void>;
  setAssignees: (id: number, names: string[]) => Promise<void>;
  toggleAssignee: (id: number, name: string) => Promise<void>;
  toggleImportant: (id: number) => Promise<void>;
  setEstimatedHours: (id: number, hours: number | null) => Promise<void>;
  toggleDependency: (id: number, depId: number) => Promise<void>;
  addAttachment: (
    id: number,
    attachment: Omit<TaskAttachment, "id" | "when">,
  ) => Promise<void>;
  removeAttachment: (id: number, attId: number) => Promise<void>;
  approveTask: (id: number, approver: string) => Promise<void>;
  unapproveTask: (id: number) => Promise<void>;
  addTask: (input: AddTaskInput) => Promise<void>;
  addRemark: (taskId: number, author: string, body: string) => Promise<void>;
  logTime: (input: LogTimeInput) => Promise<void>;
  bulkReassign: (ids: number[], name: string) => Promise<void>;
  bulkSetTargetDate: (ids: number[], date: string) => Promise<void>;
};

const TasksCtx = createContext<Ctx | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [tRes, eRes, aRes] = await Promise.all([
        fetch("/api/tasks", { cache: "no-store" }),
        fetch("/api/time-entries", { cache: "no-store" }),
        fetch("/api/audit", { cache: "no-store" }),
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
    async (id: number, attachment: Omit<TaskAttachment, "id" | "when">) => {
      const res = await fetch(`/api/tasks/${id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attachment),
      });
      if (!res.ok) return;
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

  const addTask = useCallback(async (input: AddTaskInput) => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (body.task) setTasks((prev) => [body.task as Task, ...prev]);
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
        refresh,
        byId,
        forProject,
        entriesForTask,
        setStatus,
        setPriority,
        setTargetDate,
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
        addRemark,
        logTime,
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
