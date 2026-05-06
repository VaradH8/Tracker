"use client";

import { createContext, useContext, useState } from "react";
import { TaskDrawer } from "./TaskDrawer";

type Ctx = {
  open: (id: number) => void;
  close: () => void;
};

const TaskDrawerCtx = createContext<Ctx | null>(null);

export function useTaskDrawer(): Ctx {
  const c = useContext(TaskDrawerCtx);
  if (!c) {
    return { open: () => {}, close: () => {} };
  }
  return c;
}

export function TaskDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [taskId, setTaskId] = useState<number | null>(null);
  return (
    <TaskDrawerCtx.Provider
      value={{ open: setTaskId, close: () => setTaskId(null) }}
    >
      {children}
      {taskId != null && (
        <TaskDrawer taskId={taskId} onClose={() => setTaskId(null)} />
      )}
    </TaskDrawerCtx.Provider>
  );
}
