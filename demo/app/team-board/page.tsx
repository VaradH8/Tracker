"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, Download, Search, Filter } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { TaskCard } from "@/components/TaskCard";
import { type Status } from "@/lib/mock";
import { useRole } from "@/lib/role";
import { useTasks } from "@/lib/tasks-store";

const COLUMNS: { id: Status; title: string; accent: string }[] = [
  { id: "To Do", title: "To Do", accent: "bg-ink-400" },
  { id: "In Progress", title: "In Progress", accent: "bg-brand-blue" },
  { id: "Blocked", title: "Blocked", accent: "bg-brand-red" },
  { id: "Done", title: "Done", accent: "bg-brand-green" },
];

const TEAM = "Samanvay – Engg Memory";

export default function TeamBoardPage() {
  const [role] = useRole();
  const { tasks, setStatus, addTask } = useTasks();
  const readOnly = role === "User";

  const teamTasks = tasks.filter((t) => t.team === TEAM);

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);

  function onDragStart(e: React.DragEvent, id: number) {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent, col: Status) {
    if (readOnly) return;
    e.preventDefault();
    setDragOver(col);
  }
  function onDrop(col: Status) {
    if (readOnly || draggedId == null) return;
    setStatus(draggedId, col);
    setDraggedId(null);
    setDragOver(null);
  }

  return (
    <>
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs text-ink-500 mb-1">Org · Teams ·</p>
            <h1 className="font-heading text-2xl font-semibold">{TEAM}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost border border-ink-200">
              <Download size={16} className="mr-1.5" /> Export Excel
            </button>
            {readOnly && (
              <span
                className="pill-grey"
                title="Only Manager can create tasks"
              >
                Read-only · viewing as User
              </span>
            )}
          </div>
        </div>

        <div className="card p-3 mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              placeholder="Search tasks…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <button className="btn-ghost text-xs border border-ink-200">
            <Filter size={14} className="mr-1.5" /> All projects
          </button>
          <span className="pill-blue cursor-pointer">Priority ≥ High</span>
          <span className="pill-grey cursor-pointer hover:bg-ink-200">
            Due this week
          </span>
          <span className="pill-grey cursor-pointer hover:bg-ink-200">
            Overdue
          </span>
          <span className="pill-grey cursor-pointer hover:bg-ink-200">
            Important ⭐
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = teamTasks.filter((t) => t.status === col.id);
            const isOver = dragOver === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => onDragOver(e, col.id)}
                onDrop={() => onDrop(col.id)}
                onDragLeave={() => setDragOver(null)}
                className={`bg-ink-50 rounded-card p-3 min-h-[400px] flex flex-col transition-colors ${
                  isOver ? "bg-brand-blueBg ring-2 ring-brand-blue" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                    <h2 className="font-heading text-sm font-semibold">
                      {col.title}
                    </h2>
                    <span className="text-xs text-ink-500">
                      {colTasks.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable={!readOnly}
                      onDragStart={(e) => onDragStart(e, t.id)}
                      className={
                        draggedId === t.id
                          ? "opacity-40"
                          : readOnly
                            ? ""
                            : "cursor-grab active:cursor-grabbing"
                      }
                    >
                      <TaskCard task={t} />
                    </div>
                  ))}
                </div>

                {!readOnly && (
                  <InlineAddTask
                    onAdd={(title) =>
                      addTask({ title, team: TEAM, status: col.id })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}

function InlineAddTask({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");

  function commit() {
    const t = title.trim();
    if (t) onAdd(t);
    setTitle("");
    setEditing(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setTitle("");
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 card p-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder="Task title — Enter to save, Esc to cancel"
          className="w-full text-sm focus:outline-none placeholder:text-ink-400"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="mt-2 w-full text-left text-sm text-ink-500 hover:text-brand-blue hover:bg-white px-2 py-1.5 rounded transition-colors flex items-center gap-1.5"
    >
      <Plus size={14} /> Add a task
    </button>
  );
}
