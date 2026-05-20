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
  type Priority,
  type Status,
  type Task,
  type TimeEntry,
} from "./mock";

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
  byId: (id: number) => Task | undefined;
  forProject: (projectId: number) => Task[];
  entriesForTask: (taskId: number) => TimeEntry[];
  setStatus: (id: number, status: Status) => void;
  setPriority: (id: number, priority: Priority) => void;
  setTargetDate: (id: number, date: string) => void;
  toggleAssignee: (id: number, name: string) => void;
  toggleImportant: (id: number) => void;
  addTask: (input: AddTaskInput) => void;
  logTime: (input: LogTimeInput) => void;
};

const TasksCtx = createContext<Ctx | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [timeEntries, setTimeEntries] =
    useState<TimeEntry[]>(SEED_TIME_ENTRIES);

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

  const setStatus = useCallback((id: number, status: Status) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next: Task = { ...t, status };
        if (status === "Done") next.overdueDays = undefined;
        return next;
      }),
    );
  }, []);

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
        byId,
        forProject,
        entriesForTask,
        setStatus,
        setPriority,
        setTargetDate,
        toggleAssignee,
        toggleImportant,
        addTask,
        logTime,
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
