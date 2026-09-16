"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "@/lib/notifications-store";
import { useMyFirstName } from "@/lib/account-store";
import { useToast } from "@/components/Toast";
import { useTaskDrawer } from "@/components/TaskDrawerProvider";

/**
 * A popup the moment a task is assigned to the signed-in user.
 *
 * The assigner and the assignee are in different browsers, so the only
 * signal is the notification store's periodic refresh: each time it
 * returns, any `assigned` notification for me that wasn't there last time
 * is announced. That bounds the delay at the refresh interval — a minute —
 * which is the architecture, not a shortcut.
 *
 * The first load seeds the seen-set without announcing anything: a backlog
 * of old assignments is history, not news. The set is reseeded when the
 * signed-in user changes, so one person's arrivals are never announced to
 * the next.
 *
 * Mounted once in the root layout, inside every provider it reads from;
 * it renders nothing.
 */
export function NewAssignmentToaster() {
  const { forPerson } = useNotifications();
  const me = useMyFirstName();
  const toast = useToast();
  const drawer = useTaskDrawer();
  const seen = useRef<{ who: string; ids: Set<number> } | null>(null);

  useEffect(() => {
    if (!me) return;
    const mine = forPerson(me).filter((n) => n.kind === "assigned");

    if (!seen.current || seen.current.who !== me) {
      seen.current = { who: me, ids: new Set(mine.map((n) => n.id)) };
      return;
    }

    for (const n of mine) {
      if (seen.current.ids.has(n.id)) continue;
      seen.current.ids.add(n.id);
      // Already read elsewhere (another tab, the bell) — nothing to announce.
      if (n.read) continue;
      toast.show(
        `${n.title} — ${n.body}`,
        "info",
        n.taskId != null
          ? { label: "Open", onClick: () => drawer.open(n.taskId as number) }
          : undefined,
      );
    }
    // `toast` and `drawer` are provider contexts, stable across renders;
    // `forPerson` changes whenever the notification list does, which is
    // exactly the trigger wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forPerson, me]);

  return null;
}
