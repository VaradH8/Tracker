"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FolderKanban,
  CheckSquare,
  Users,
  Building2,
  CornerDownLeft,
} from "lucide-react";
import {
  PROJECTS,
  CLIENTS,
  RESOURCES,
  projectById,
} from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useTaskDrawer } from "./TaskDrawerProvider";

type ResultType = "Project" | "Task" | "Person" | "Client";

type Result = {
  type: ResultType;
  label: string;
  sub: string;
  run: () => void;
};

const TYPE_ICON = {
  Project: FolderKanban,
  Task: CheckSquare,
  Person: Users,
  Client: Building2,
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const { tasks } = useTasks();
  const drawer = useTaskDrawer();

  // Cmd/Ctrl+K toggles the palette; the top-bar search button dispatches
  // an "open-command-palette" event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];

    for (const p of PROJECTS) {
      if (p.name.toLowerCase().includes(q)) {
        out.push({
          type: "Project",
          label: p.name,
          sub: "Project",
          run: () => router.push(`/projects/${p.id}`),
        });
      }
    }
    for (const t of tasks) {
      if (t.title.toLowerCase().includes(q)) {
        out.push({
          type: "Task",
          label: t.title,
          sub: projectById(t.projectId)?.name ?? "Task",
          run: () => drawer.open(t.id),
        });
      }
    }
    for (const r of RESOURCES) {
      if (r.name.toLowerCase().includes(q)) {
        out.push({
          type: "Person",
          label: r.name,
          sub: r.designation,
          run: () => router.push("/resources"),
        });
      }
    }
    for (const c of CLIENTS) {
      if (c.name.toLowerCase().includes(q)) {
        out.push({
          type: "Client",
          label: c.name,
          sub: c.industry,
          run: () => router.push(`/clients/${c.id}`),
        });
      }
    }
    return out.slice(0, 20);
  }, [query, tasks, router, drawer]);

  function choose(r: Result) {
    setOpen(false);
    r.run();
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      choose(results[active]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-ink-900/30 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-ink-200">
          <Search size={16} className="text-ink-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Search projects, tasks, people, clients…"
            className="flex-1 py-3 text-sm focus:outline-none"
          />
          <kbd className="text-[10px] text-ink-400 border border-ink-200 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto py-1">
          {query.trim() === "" && (
            <p className="px-4 py-6 text-sm text-ink-400 text-center">
              Type to search across the whole workspace.
            </p>
          )}
          {query.trim() !== "" && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-400 text-center">
              No matches for “{query}”.
            </p>
          )}
          {results.map((r, i) => {
            const Icon = TYPE_ICON[r.type];
            return (
              <button
                key={`${r.type}-${r.label}-${i}`}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
                  i === active ? "bg-brand-blueBg" : "hover:bg-ink-50"
                }`}
              >
                <span className="w-7 h-7 rounded grid place-items-center bg-ink-100 text-ink-500 shrink-0">
                  <Icon size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-ink-900 truncate">
                    {r.label}
                  </span>
                  <span className="block text-xs text-ink-500 truncate">
                    {r.type} · {r.sub}
                  </span>
                </span>
                {i === active && (
                  <CornerDownLeft size={13} className="text-ink-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
