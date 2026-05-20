"use client";

import {
  UserPlus,
  RefreshCw,
  AtSign,
  Lock,
  Star,
  AlertTriangle,
  Check,
} from "lucide-react";
import { useTaskDrawer } from "./TaskDrawerProvider";
import { useNotifications } from "@/lib/notifications-store";
import type { NotificationKind } from "@/lib/mock";

const ICON: Record<NotificationKind, typeof UserPlus> = {
  assigned: UserPlus,
  status_change: RefreshCw,
  mention: AtSign,
  blocked: Lock,
  important: Star,
  overdue: AlertTriangle,
};

const TONE: Record<NotificationKind, string> = {
  assigned: "bg-brand-blueBg text-brand-blue",
  status_change: "bg-ink-100 text-ink-700",
  mention: "bg-brand-blueBg text-brand-blue",
  blocked: "bg-brand-redBg text-brand-redText",
  important: "bg-brand-yellowBg text-brand-yellowText",
  overdue: "bg-brand-redBg text-brand-redText",
};

export function NotificationsPanel({
  person,
  onClose,
}: {
  person: string;
  onClose: () => void;
}) {
  const { forPerson, markRead, markAllRead, unreadCount } = useNotifications();
  const drawer = useTaskDrawer();
  const items = forPerson(person);
  const unread = unreadCount(person);

  return (
    <div className="absolute right-0 mt-2 w-80 card p-0 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-200">
        <h3 className="font-heading text-sm font-semibold">
          Notifications
          {unread > 0 && (
            <span className="ml-1.5 text-brand-blue">({unread})</span>
          )}
        </h3>
        {unread > 0 && (
          <button
            onClick={() => markAllRead(person)}
            className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
          >
            <Check size={12} /> Mark all read
          </button>
        )}
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-400">
            You're all caught up.
          </p>
        ) : (
          <ul>
            {items.map((n) => {
              const Icon = ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      markRead(n.id);
                      if (n.taskId) {
                        drawer.open(n.taskId);
                        onClose();
                      }
                    }}
                    className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-ink-50 border-b border-ink-100 last:border-0 ${
                      n.read ? "" : "bg-brand-blueBg/30"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${TONE[n.kind]}`}
                    >
                      <Icon size={14} />
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
                      <p className="text-xs text-ink-600 leading-snug">
                        {n.body}
                      </p>
                      <span className="text-[11px] text-ink-400">
                        {n.when}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
