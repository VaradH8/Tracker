"use client";

import { useState } from "react";
import {
  Bell,
  Check,
  Search,
  UserPlus,
  RefreshCw,
  AtSign,
  Lock,
  Star,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { useNotifications } from "@/lib/notifications-store";
import { useTaskDrawer } from "@/components/TaskDrawerProvider";
import { useRole } from "@/lib/role";
import { meName } from "@/lib/access";
import type { NotificationKind } from "@/lib/mock";

const KIND_ICON: Record<NotificationKind, typeof UserPlus> = {
  assigned: UserPlus,
  status_change: RefreshCw,
  mention: AtSign,
  blocked: Lock,
  important: Star,
  overdue: AlertTriangle,
};

const KIND_TONE: Record<NotificationKind, string> = {
  assigned: "bg-brand-blueBg text-brand-blue",
  status_change: "bg-ink-100 text-ink-700",
  mention: "bg-brand-blueBg text-brand-blue",
  blocked: "bg-brand-redBg text-brand-redText",
  important: "bg-brand-yellowBg text-brand-yellowText",
  overdue: "bg-brand-redBg text-brand-redText",
};

const KIND_LABEL: Record<NotificationKind, string> = {
  assigned: "Assigned",
  status_change: "Status",
  mention: "Mentions",
  blocked: "Blocked",
  important: "Important",
  overdue: "Overdue",
};

const KINDS: ("All" | NotificationKind)[] = [
  "All",
  "assigned",
  "mention",
  "blocked",
  "important",
  "status_change",
  "overdue",
];

export default function NotificationsPage() {
  const [role] = useRole();
  const me = meName(role);
  const { forPerson, unreadCount, markRead, markAllRead } = useNotifications();
  const drawer = useTaskDrawer();
  const [kind, setKind] = useState<"All" | NotificationKind>("All");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");

  const all = forPerson(me);
  const visible = all
    .filter((n) => kind === "All" || n.kind === kind)
    .filter((n) => filter === "all" || !n.read)
    .filter((n) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
      );
    });

  const unread = unreadCount(me);

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-heading text-3xl font-semibold">
              Notifications
            </h1>
            <p className="text-sm text-ink-500 mt-1">
              Everything addressed to you · {unread} unread of {all.length}
            </p>
          </div>
          {unread > 0 && (
            <button
              onClick={() => markAllRead(me)}
              className="btn-ghost border border-ink-200"
            >
              <Check size={16} className="mr-1.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="card p-3 mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notifications…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div className="inline-flex rounded-card border border-ink-200 overflow-hidden text-sm">
            <button
              onClick={() => setFilter("all")}
              className={
                filter === "all"
                  ? "px-3 py-1 bg-brand-blue text-white font-medium"
                  : "px-3 py-1 text-ink-700 hover:bg-ink-100"
              }
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={
                filter === "unread"
                  ? "px-3 py-1 bg-brand-blue text-white font-medium"
                  : "px-3 py-1 text-ink-700 hover:bg-ink-100"
              }
            >
              Unread
            </button>
          </div>
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={
                kind === k
                  ? "pill-blue cursor-pointer"
                  : "pill-grey cursor-pointer hover:bg-ink-200"
              }
            >
              {k === "All" ? "All kinds" : KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            Icon={Bell}
            title="Nothing here"
            message={
              all.length === 0
                ? "When something is addressed to you, it lands here."
                : "Nothing matches these filters. Widen the kind or switch to All."
            }
          />
        ) : (
          <ul className="card divide-y divide-ink-100 overflow-hidden">
            {visible.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      markRead(n.id);
                      if (n.taskId) drawer.open(n.taskId);
                    }}
                    className={`w-full text-left px-5 py-4 flex gap-3 hover:bg-ink-50 ${
                      n.read ? "" : "bg-brand-blueBg/30"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${KIND_TONE[n.kind]}`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-blue shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-ink-600">{n.body}</p>
                      <span className="text-xs text-ink-400">{n.when}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
