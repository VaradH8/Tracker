"use client";

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

export default function MyTasksPage() {
  const [role] = useRole();
  const { tasks } = useTasks();

  const me = role === "User" ? "Sanjana" : "Manasi";
  const mine = tasks.filter((t) => t.assignees.includes(me));

  return (
    <>
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-2xl font-semibold">My Tasks</h1>
          <p className="text-sm text-ink-500 mt-1">
            All tasks assigned to you, across teams · grouped by status
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const cards = mine.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className="bg-ink-50 rounded-card p-3 min-h-[300px]"
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                  <h2 className="font-heading text-sm font-semibold">
                    {col.title}
                  </h2>
                  <span className="text-xs text-ink-500">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                  {cards.length === 0 && (
                    <p className="text-xs text-ink-400 italic px-1">empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {role === "User" && (
          <p className="text-xs text-ink-400 mt-6 italic text-center">
            Click any pill or button on a card to update status — no menus, no
            drawers needed.
          </p>
        )}
      </main>
    </>
  );
}
