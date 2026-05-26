"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  TASKS as SEED_TASKS,
  TIME_ENTRIES as SEED_TIME_ENTRIES,
  AUDIT_LOG as SEED_AUDIT,
  projectById,
  type AuditEntry,
  type Priority,
  type Status,
  type Task,
  type TimeEntry,
} from "./mock";
import { useRole, type Role } from "./role";

const ROLE_PERSON: Record<Role, string> = {
  Admin: "Varad Hadawale",
  Coordinator: "Manasi Kulkarni",
  BusinessDeveloper: "Rohit Mehra",
  Developer: "Sanjana Jadhav",
};

type AddTaskInput = {
  title: string;
  projectId: number;
  status: Status;
  priority?: Priority;
  /** Person Responsible — the assigner. Defaults to the creator's first name. */
  responsible?: string;
  /** Person Accountable — the doers. */
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
  byId: (id: number) => Task | undefined;
  forProject: (projectId: number) => Task[];
  entriesForTask: (taskId: number) => TimeEntry[];
  setStatus: (id: number, status: Status) => void;
  setPriority: (id: number, priority: Priority) => void;
  setTargetDate: (id: number, date: string) => void;
  setDescription: (id: number, description: string) => void;
  setAssignees: (id: number, names: string[]) => void;
  toggleAssignee: (id: number, name: string) => void;
  toggleImportant: (id: number) => void;
  addTask: (input: AddTaskInput) => void;
  addRemark: (taskId: number, author: string, body: string) => void;
  logTime: (input: LogTimeInput) => void;
  bulkReassign: (ids: number[], name: string) => void;
  bulkSetTargetDate: (ids: number[], date: string) => void;
};

const TasksCtx = createContext<Ctx | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [timeEntries, setTimeEntries] =
    useState<TimeEntry[]>(SEED_TIME_ENTRIES);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(SEED_AUDIT);
  const [role] = useRole();
  const actor = ROLE_PERSON[role];

  const logAudit = useCallback(
    (entry: Omit<AuditEntry, "id" | "when">) => {
      setAuditLog((prev) => [
        {
          ...entry,
          id: Math.max(0, ...prev.map((a) => a.id)) + 1,
          when: "just now",
        },
        ...prev,
      ]);
    },
    [],
  );

  const byId = useCallback(
    (id: number) => tasks.find((t) => t.id === id),
    [tasks],
  );

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

  const logTime = useCallback((input: LogTimeInput) => {
    setTimeEntries((prev) => [
      ...prev,
      {
        id: Math.max(0, ...prev.map((e) => e.id)) + 1,
        taskId: input.taskId,
        person: input.person,
        hours: input.hours,
        date: input.date,
        note: input.note,
      },
    ]);
    // Roll the logged total into the task's actualHours so the scorecard
    // and estimate-variance numbers reflect it immediately.
    setTasks((prev) =>
      prev.map((t) =>
        t.id === input.taskId
          ? { ...t, actualHours: (t.actualHours ?? 0) + input.hours }
          : t,
      ),
    );
  }, []);

  const setStatus = useCallback(
    (id: number, status: Status) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          if (t.status !== status) {
            logAudit({
              actor,
              action: "task.status_change",
              scope: projectById(t.projectId)?.name ?? "—",
              taskTitle: t.title,
              before: t.status,
              after: status,
            });
          }
          const next: Task = { ...t, status };
          if (status === "Done") next.overdueDays = undefined;
          return next;
        }),
      );
    },
    [actor, logAudit],
  );

  const setPriority = useCallback((id: number, priority: Priority) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, priority } : t)),
    );
  }, []);

  const setTargetDate = useCallback((id: number, date: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, targetDate: date } : t)),
    );
  }, []);

  const setDescription = useCallback((id: number, description: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, description } : t)),
    );
  }, []);

  const addRemark = useCallback(
    (taskId: number, author: string, body: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const remarks = t.remarks ?? [];
          return {
            ...t,
            remarks: [
              ...remarks,
              {
                id: Math.max(0, ...remarks.map((r) => r.id)) + 1,
                author,
                body,
                when: "just now",
              },
            ],
          };
        }),
      );
    },
    [],
  );

  const toggleAssignee = useCallback((id: number, name: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const has = t.assignees.includes(name);
        return {
          ...t,
          assignees: has
            ? t.assignees.filter((a) => a !== name)
            : [...t.assignees, name],
        };
      }),
    );
  }, []);

  const setAssignees = useCallback((id: number, names: string[]) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, assignees: names } : t)),
    );
  }, []);

  const bulkReassign = useCallback((ids: number[], name: string) => {
    const idSet = new Set(ids);
    setTasks((prev) =>
      prev.map((t) =>
        idSet.has(t.id) ? { ...t, assignees: [name] } : t,
      ),
    );
  }, []);

  const bulkSetTargetDate = useCallback((ids: number[], date: string) => {
    const idSet = new Set(ids);
    setTasks((prev) =>
      prev.map((t) =>
        idSet.has(t.id) ? { ...t, targetDate: date } : t,
      ),
    );
  }, []);

  const toggleImportant = useCallback((id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, important: !t.important } : t)),
    );
  }, []);

  const addTask = useCallback((input: AddTaskInput) => {
    setTasks((prev) => {
      const next: Task = {
        id: Math.max(...prev.map((t) => t.id), 100) + 1,
        title: input.title,
        projectId: input.projectId,
        status: input.status,
        priority: input.priority ?? "Medium",
        responsible: input.responsible ?? "Manasi",
        assignees: input.assignees ?? [],
        targetDate: input.targetDate ?? plusDays(new Date(), 7),
        estimatedHours: null,
        important: false,
      };
      return [...prev, next];
    });
  }, []);

  return (
    <TasksCtx.Provider
      value={{
        tasks,
        timeEntries,
        auditLog,
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

function plusDays(d: Date, n: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}
