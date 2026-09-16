"use client";

import { createContext, useContext, useState } from "react";
import { TaskDrawer } from "./TaskDrawer";

/** Extra context for an open() call made from inside another drawer.
 *  `backLabel` turns the task drawer's close control into a labelled
 *  "Back" affordance, so the caller's own drawer — left mounted
 *  underneath — reads as the place you return to. */
export type OpenTaskOptions = { backLabel?: string };

type Ctx = {
  open: (id: number, opts?: OpenTaskOptions) => void;
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
  const [open, setOpen] = useState<{
    taskId: number;
    backLabel?: string;
  } | null>(null);
  return (
    <TaskDrawerCtx.Provider
      value={{
        open: (taskId, opts) => setOpen({ taskId, backLabel: opts?.backLabel }),
        close: () => setOpen(null),
      }}
    >
      {children}
      {open && (
        <TaskDrawer
          taskId={open.taskId}
          backLabel={open.backLabel}
          onClose={() => setOpen(null)}
        />
      )}
    </TaskDrawerCtx.Provider>
  );
}
