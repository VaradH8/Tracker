"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Lock } from "lucide-react";
import { useTasks } from "@/lib/tasks-store";
import { useAccounts, useMyFirstName } from "@/lib/account-store";
import { useToast } from "./Toast";
import { useNotifications } from "@/lib/notifications-store";
import { Modal } from "./Modal";

type Ctx = { requestBlock: (taskId: number) => void };

const BlockCtx = createContext<Ctx | null>(null);

export function useBlockDialog(): Ctx {
  return useContext(BlockCtx) ?? { requestBlock: () => {} };
}

export function BlockDialogProvider({ children }: { children: ReactNode }) {
  const store = useTasks();
  const toast = useToast();
  const { notify } = useNotifications();
  const { accounts } = useAccounts();
  const me = useMyFirstName();
  const people = accounts
    .filter((a) => a.active && !a.isAdmin)
    .map((a) => a.name.split(" ")[0]);
  const [taskId, setTaskId] = useState<number | null>(null);

  const task = taskId != null ? store.byId(taskId) : undefined;

  function close() {
    setTaskId(null);
  }

  return (
    <BlockCtx.Provider value={{ requestBlock: setTaskId }}>
      {children}
      {task && (
        <BlockForm
          title={task.title}
          people={people}
          onCancel={close}
          onConfirm={(reason, blockedBy) => {
            store.setStatus(task.id, "Blocked");
            const author = me || "—";
            const suffix = blockedBy ? ` — blocked by ${blockedBy}` : "";
            store.addRemark(task.id, author, `🚫 Blocked: ${reason}${suffix}`);
            // Notify the Person Responsible (the one who assigned the task).
            if (task.responsible && task.responsible !== author) {
              notify({
                recipient: task.responsible,
                kind: "blocked",
                title: "A task you assigned is blocked",
                body: `${task.title} — ${reason}`,
                taskId: task.id,
              });
            }
            toast.show(
              `“${task.title}” marked Blocked. ${task.responsible} notified.`,
            );
            close();
          }}
        />
      )}
    </BlockCtx.Provider>
  );
}

function BlockForm({
  title,
  people,
  onCancel,
  onConfirm,
}: {
  title: string;
  people: string[];
  onCancel: () => void;
  onConfirm: (reason: string, blockedBy: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [blockedBy, setBlockedBy] = useState("");

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Lock size={18} className="text-brand-redText" /> Mark as Blocked
        </span>
      }
      onClose={onCancel}
    >
      <p className="text-sm text-ink-500 mb-5 truncate">{title}</p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        What's the blocker? <span className="text-brand-redText">*</span>
      </label>
      <textarea
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="e.g. Waiting on the v2 API spec from Saipem"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Blocked by{" "}
        <span className="text-ink-400 font-normal">(optional)</span>
      </label>
      <select
        value={blockedBy}
        onChange={(e) => setBlockedBy(e.target.value)}
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm"
      >
        <option value="">No specific person</option>
        {people.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() => onConfirm(reason.trim(), blockedBy)}
          disabled={!reason.trim()}
          className="btn-primary"
        >
          Mark Blocked
        </button>
      </div>
    </Modal>
  );
}
