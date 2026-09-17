"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
 * of old assignments is history, not news. That seeding waits for the
 * store's `loaded` flag — before it, an empty list means "not fetched yet",
 * and seeding on it would announce the entire backlog a minute later as if
 * it had all just arrived. The set is reseeded when the signed-in user
 * changes, so one person's arrivals are never announced to the next.
 *
 * Several arrivals in one refresh (a bulk assignment, an import) become
 * one toast with a count, not a stack of cards down the side of the page.
 *
 * Mounted once in the root layout, inside every provider it reads from;
 * it renders nothing.
 */
export function NewAssignmentToaster() {
  const { forPerson, loaded } = useNotifications();
  const me = useMyFirstName();
  const toast = useToast();
  const drawer = useTaskDrawer();
  const router = useRouter();
  const seen = useRef<{ who: string; ids: Set<number> } | null>(null);

  useEffect(() => {
    if (!me || !loaded) return;
    const mine = forPerson(me).filter((n) => n.kind === "assigned");

    if (!seen.current || seen.current.who !== me) {
      seen.current = { who: me, ids: new Set(mine.map((n) => n.id)) };
      return;
    }

    const fresh = mine.filter((n) => {
      if (seen.current!.ids.has(n.id)) return false;
      seen.current!.ids.add(n.id);
      // Already read elsewhere (another tab, the bell) — nothing to announce.
      return !n.read;
    });

    if (fresh.length > 3) {
      toast.show(`${fresh.length} tasks assigned to you`, "info", {
        label: "See all",
        onClick: () => router.push("/notifications"),
      });
      return;
    }
    for (const n of fresh) {
      toast.show(
        `${n.title} — ${n.body}`,
        "info",
        n.taskId != null
          ? { label: "Open", onClick: () => drawer.open(n.taskId as number) }
          : undefined,
      );
    }
    // `toast`, `drawer` and `router` are provider contexts, stable across
    // renders; `forPerson` changes whenever the notification list does,
    // which is exactly the trigger wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forPerson, loaded, me]);

  return null;
}
