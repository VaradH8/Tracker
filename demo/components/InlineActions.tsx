"use client";

import { useRef, useState } from "react";
import {
  Play,
  Check,
  Lock,
  RotateCcw,
  Calendar,
  Users,
  Star,
  Clock,
} from "lucide-react";
import { Popover } from "./Popover";
import {
  priorityPill,
  statusPill,
  type Priority,
  type Status,
  type Task,
} from "@/lib/mock";
import { useAccounts } from "@/lib/account-store";

const STATUSES: Status[] = [
  "To Do",
  "In Progress",
  "Blocked",
  "In review",
  "Done",
];
const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];

const AVATAR_COLORS = [
  "bg-brand-blue",
  "bg-brand-red",
  "bg-brand-green",
  "bg-brand-yellow",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function StatusPicker({
  value,
  onChange,
  onBlock,
  readOnly,
}: {
  value: Status;
  onChange: (s: Status) => void;
  /** If provided, picking "Blocked" calls this instead (to collect a reason). */
  onBlock?: () => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return <span className={statusPill(value)}>{value}</span>;
  }
  return (
    <Popover
      trigger={() => (
        <span
          className={
            statusPill(value) +
            " cursor-pointer hover:ring-2 hover:ring-brand-blue/30 transition"
          }
          title="Change status"
        >
          {value}
        </span>
      )}
    >
      {(close) => (
        <ul className="text-sm">
          {STATUSES.map((s) => (
            <li key={s}>
              <button
                onClick={() => {
                  if (s === "Blocked" && onBlock) onBlock();
                  else onChange(s);
                  close();
                }}
                className={`w-full text-left px-2 py-1.5 rounded hover:bg-ink-100 flex items-center gap-2 ${
                  value === s ? "bg-brand-blueBg" : ""
                }`}
              >
                <span className={statusPill(s)}>{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

export function PriorityPicker({
  value,
  onChange,
  readOnly,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return <span className={priorityPill(value)}>{value}</span>;
  }
  return (
    <Popover
      trigger={() => (
        <span
          className={
            priorityPill(value) +
            " cursor-pointer hover:ring-2 hover:ring-brand-blue/30 transition"
          }
          title="Change priority"
        >
          {value}
        </span>
      )}
    >
      {(close) => (
        <ul className="text-sm">
          {PRIORITIES.map((p) => (
            <li key={p}>
              <button
                onClick={() => {
                  onChange(p);
                  close();
                }}
                className={`w-full text-left px-2 py-1.5 rounded hover:bg-ink-100 flex items-center gap-2 ${
                  value === p ? "bg-brand-blueBg" : ""
                }`}
              >
                <span className={priorityPill(p)}>{p}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

export function DateField({
  value,
  onChange,
  readOnly,
  label,
}: {
  value: string;
  onChange: (d: string) => void;
  readOnly?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const formatted = formatRelativeDate(value);
  const tone = relativeTone(value);

  return (
    <span
      className={
        readOnly
          ? `inline-flex items-center gap-1 text-xs ${tone.text}`
          : `inline-flex items-center gap-1 text-xs ${tone.text} hover:underline cursor-pointer`
      }
      title={label ? `${label}: ${value}` : value}
    >
      <button
        type="button"
        disabled={readOnly}
        onClick={(e) => {
          e.stopPropagation();
          ref.current?.showPicker?.();
          ref.current?.focus();
        }}
        className="inline-flex items-center gap-1"
      >
        <Calendar size={11} />
        {formatted}
      </button>
      <input
        ref={ref}
        type="date"
        value={value}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="sr-only"
        aria-label={label ?? "Target date"}
      />
    </span>
  );
}

export function ImportantToggle({
  value,
  onChange,
  readOnly,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  readOnly?: boolean;
}) {
  if (readOnly && !value) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!readOnly) onChange(!value);
      }}
      disabled={readOnly}
      className={`p-1 -m-1 rounded ${readOnly ? "" : "hover:bg-brand-yellowBg"}`}
      title={
        readOnly
          ? "Important — pinned to org dashboard"
          : value
            ? "Click to unpin from org dashboard"
            : "Pin to org dashboard"
      }
      aria-label="Toggle Important"
    >
      <Star
        size={14}
        className={
          value
            ? "text-brand-yellow fill-brand-yellow"
            : "text-ink-400 hover:text-brand-yellow"
        }
      />
    </button>
  );
}

export function AssigneePicker({
  selected,
  onToggle,
  readOnly,
}: {
  selected: string[];
  onToggle: (name: string) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div className="flex -space-x-1.5">
        {selected.slice(0, 3).map((a, i) => (
          <Avatar key={a} name={a} colorIdx={i} />
        ))}
        {selected.length > 3 && (
          <div className="w-6 h-6 rounded-full border-2 border-white grid place-items-center text-[10px] font-medium bg-ink-100 text-ink-700">
            +{selected.length - 3}
          </div>
        )}
      </div>
    );
  }

  return (
    <Popover
      trigger={() => (
        <div
          className="flex -space-x-1.5 cursor-pointer hover:opacity-80"
          title="Click to change assignees"
        >
          {selected.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-brand-blue">
              <Users size={12} /> Assign
            </span>
          ) : (
            selected
              .slice(0, 3)
              .map((a, i) => <Avatar key={a} name={a} colorIdx={i} />)
          )}
          {selected.length > 3 && (
            <div className="w-6 h-6 rounded-full border-2 border-white grid place-items-center text-[10px] font-medium bg-ink-100 text-ink-700">
              +{selected.length - 3}
            </div>
          )}
        </div>
      )}
    >
      {() => <AssigneeMenu selected={selected} onToggle={onToggle} />}
    </Popover>
  );
}

function AssigneeMenu({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const { accounts } = useAccounts();
  const people = accounts
    .filter((a) => a.active && !a.isAdmin)
    .filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-w-[240px]">
      <div className="px-2.5 py-1.5 text-[11px] text-ink-500 border-b border-ink-100 flex items-center justify-between">
        <span>
          {selected.length === 0
            ? "Pick one or more"
            : `${selected.length} assigned — tap to add or remove`}
        </span>
      </div>
      <div className="p-1.5 border-b border-ink-100">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full px-2 py-1 text-sm rounded border border-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
      </div>
      <ul className="text-sm max-h-56 overflow-y-auto py-1">
        {people.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-400 italic">
            {accounts.length === 0
              ? "No teammates yet — add users from Admin → Users."
              : "No one matches."}
          </li>
        )}
        {people.map((a, i) => {
          const first = a.name.split(" ")[0];
          const checked = selected.includes(first);
          return (
            <li key={a.id}>
              <button
                onClick={() => onToggle(first)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-ink-100 flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="accent-brand-blue"
                />
                <Avatar name={first} colorIdx={i} size="sm" />
                <span className="flex-1">{a.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Avatar({
  name,
  colorIdx,
  size = "md",
}: {
  name: string;
  colorIdx: number;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  return (
    <div
      title={name}
      className={`${dim} rounded-full border-2 border-white grid place-items-center font-heading font-medium text-white ${AVATAR_COLORS[colorIdx % AVATAR_COLORS.length]}`}
    >
      {initials(name)}
    </div>
  );
}

type QuickButton = {
  label: string;
  tip: string;
  icon: typeof Play;
  tone: string;
  next: Status | "BLOCK";
};

export function QuickActions({
  task,
  onStatus,
  onBlock,
  isAssignee,
  canEdit,
}: {
  task: Task;
  onStatus: (s: Status) => void;
  /** Picking "Block" calls this (to collect a reason) instead of onStatus. */
  onBlock?: () => void;
  isAssignee: boolean;
  canEdit: boolean;
}) {
  const allowed = isAssignee || canEdit;
  if (!allowed) return null;

  const buttons: QuickButton[] = [];
  switch (task.status) {
    case "To Do":
      buttons.push({
        label: "Start",
        tip: "Move to In Progress",
        icon: Play,
        tone: "text-brand-blue hover:bg-brand-blueBg",
        next: "In Progress",
      });
      break;
    case "In Progress":
      buttons.push({
        label: "Review",
        tip: "Send to In review",
        icon: Check,
        tone: "text-brand-yellowText hover:bg-brand-yellowBg",
        next: "In review",
      });
      buttons.push({
        label: "Block",
        tip: "Mark as Blocked",
        icon: Lock,
        tone: "text-brand-redText hover:bg-brand-redBg",
        next: "BLOCK",
      });
      break;
    case "In review":
      buttons.push({
        label: "Done",
        tip: "Mark as Done",
        icon: Check,
        tone: "text-brand-green hover:bg-brand-greenBg",
        next: "Done",
      });
      buttons.push({
        label: "Back",
        tip: "Move back to In Progress",
        icon: RotateCcw,
        tone: "text-ink-500 hover:bg-ink-100",
        next: "In Progress",
      });
      break;
    case "Blocked":
      buttons.push({
        label: "Unblock",
        tip: "Move back to In Progress",
        icon: Play,
        tone: "text-brand-blue hover:bg-brand-blueBg",
        next: "In Progress",
      });
      break;
    case "Done":
      buttons.push({
        label: "Reopen",
        tip: "Move back to In Progress",
        icon: RotateCcw,
        tone: "text-ink-500 hover:bg-ink-100",
        next: "In Progress",
      });
      break;
  }

  return (
    <div className="flex items-center gap-0.5">
      {buttons.map((b) => {
        const Icon = b.icon;
        return (
          <button
            key={b.label}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (b.next === "BLOCK") {
                if (onBlock) onBlock();
                else onStatus("Blocked");
              } else {
                onStatus(b.next);
              }
            }}
            title={b.tip}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 ${b.tone}`}
          >
            <Icon size={11} /> {b.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact time-log control for a task card. Shows hours logged so far and,
 * for the people allowed to log (assignees + coordinators/admin), opens a
 * quick "+Nh today" popover. Read-only viewers see just the running total.
 */
export function TimeLogChip({
  loggedHours,
  estimatedHours,
  canLog,
  onLog,
}: {
  loggedHours: number;
  estimatedHours?: number | null;
  canLog: boolean;
  onLog: (hours: number) => void;
}) {
  const over =
    estimatedHours != null && estimatedHours > 0 && loggedHours > estimatedHours;

  if (!canLog) {
    if (loggedHours <= 0) return null;
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs ${
          over ? "text-brand-redText" : "text-ink-500"
        }`}
        title={`${loggedHours}h logged${
          estimatedHours != null ? ` of ${estimatedHours}h estimated` : ""
        }`}
      >
        <Clock size={11} />
        {loggedHours}h
      </span>
    );
  }

  return (
    <Popover
      trigger={() => (
        <span
          className={`inline-flex items-center gap-1 text-xs cursor-pointer hover:underline ${
            over
              ? "text-brand-redText"
              : "text-ink-500 hover:text-brand-blue"
          }`}
          title={
            loggedHours > 0
              ? `${loggedHours}h logged — click to log more`
              : "Log time on this task"
          }
        >
          <Clock size={12} />
          {loggedHours > 0 && `${loggedHours}h`}
        </span>
      )}
    >
      {(close) => (
        <QuickLogMenu
          onLog={(h) => {
            onLog(h);
            close();
          }}
        />
      )}
    </Popover>
  );
}

function QuickLogMenu({ onLog }: { onLog: (hours: number) => void }) {
  const [custom, setCustom] = useState("");
  const presets = [0.5, 1, 2, 4];

  return (
    <div className="min-w-[208px]">
      <div className="px-2 py-1 text-[11px] text-ink-400 uppercase tracking-wide font-semibold">
        Log time — today
      </div>
      <div className="flex flex-wrap gap-1 px-1 py-1">
        {presets.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onLog(h)}
            className="px-2.5 py-1 rounded border border-ink-200 text-xs font-medium hover:bg-brand-blueBg hover:border-brand-blue hover:text-brand-blue"
          >
            +{h}h
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const h = Number(custom);
          if (h > 0) onLog(h);
        }}
        className="flex items-center gap-1 px-1 pt-1"
      >
        <input
          type="number"
          step="0.5"
          min="0"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom hours"
          className="flex-1 w-full px-2 py-1 rounded border border-ink-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
        <button
          type="submit"
          disabled={!Number(custom)}
          className="btn-primary text-xs py-1 px-2.5 disabled:opacity-50"
        >
          Log
        </button>
      </form>
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  const today = new Date("2026-05-05T00:00:00");
  const target = new Date(iso + "T00:00:00");
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 6) return `in ${diff}d`;
  if (diff < -1 && diff >= -6) return `${-diff}d ago`;
  return target.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function relativeTone(iso: string): { text: string } {
  const today = new Date("2026-05-05T00:00:00");
  const target = new Date(iso + "T00:00:00");
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return { text: "text-brand-redText font-medium" };
  if (diff === 0) return { text: "text-brand-blue font-medium" };
  if (diff === 1) return { text: "text-ink-700" };
  return { text: "text-ink-500" };
}
