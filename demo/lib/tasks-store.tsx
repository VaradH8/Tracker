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
  type Priority,
  type Status,
  type Task,
} from "./mock";

type AddTaskInput = {
  title: string;
  projectId: number;
  status: Status;
  priority?: Priority;
  assignees?: string[];
  targetDate?: string;
};

type Ctx = {
  tasks: Task[];
  byId: (id: number) => Task | undefined;
  forProject: (projectId: number) => Task[];
  setStatus: (id: number, status: Status) => void;
  setPriority: (id: number, priority: Priority) => void;
  setTargetDate: (id: number, date: string) => void;
  toggleAssignee: (id: number, name: string) => void;
  toggleImportant: (id: number) => void;
  addTask: (input: AddTaskInput) => void;
};

const TasksCtx = createContext<Ctx | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);

  const byId = useCallback(
    (id: number) => tasks.find((t) => t.id === id),
    [tasks],
  );

  const forProject = useCallback(
    (projectId: number) => tasks.filter((t) => t.projectId === projectId),
    [tasks],
  );

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
        byId,
        forProject,
        setStatus,
        setPriority,
        setTargetDate,
        toggleAssignee,
        toggleImportant,
        addTask,
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
