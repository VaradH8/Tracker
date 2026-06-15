"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  AppNotification,
  EmailLogEntry,
  NotificationKind,
} from "./mock";

type NewNotification = {
  recipient: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId?: number;
};

type Ctx = {
  all: AppNotification[];
  emails: EmailLogEntry[];
  forPerson: (person: string) => AppNotification[];
  unreadCount: (person: string) => number;
  markRead: (id: number) => Promise<void>;
  markAllRead: (person: string) => Promise<void>;
  notify: (n: NewNotification) => Promise<void>;
  clearEmails: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotifCtx = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<AppNotification[]>([]);
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [nRes, eRes] = await Promise.all([
        fetch("/api/notifications", { cache: "no-store" }),
        fetch("/api/emails", { cache: "no-store" }),
      ]);
      if (nRes.ok) {
        const b = (await nRes.json()) as { notifications: AppNotification[] };
        setAll(b.notifications ?? []);
      } else setAll([]);
      if (eRes.ok) {
        const b = (await eRes.json()) as { emails: EmailLogEntry[] };
        setEmails(b.emails ?? []);
      } else setEmails([]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Poll every 60s so the bell badge and notifications page reflect
    // new mentions / assignments / leave decisions without requiring a
    // full page reload. Cheap — /api/notifications is gated by userId
    // server-side and capped at 500 rows per user.
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const forPerson = useCallback(
    (person: string) => all.filter((n) => n.recipient === person),
    [all],
  );

  const unreadCount = useCallback(
    (person: string) =>
      all.filter((n) => n.recipient === person && !n.read).length,
    [all],
  );

  const markRead = useCallback(async (id: number) => {
    setAll((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
  }, []);

  const markAllRead = useCallback(async (person: string) => {
    setAll((prev) =>
      prev.map((n) => (n.recipient === person ? { ...n, read: true } : n)),
    );
    await fetch("/api/notifications?action=read-all", { method: "PATCH" });
  }, []);

  const notify = useCallback(async (n: NewNotification) => {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(n),
    });
    if (!res.ok) return;
    void refresh();
  }, [refresh]);

  const clearEmails = useCallback(async () => {
    setEmails([]);
    await fetch("/api/emails", { method: "DELETE" });
  }, []);

  return (
    <NotifCtx.Provider
      value={{
        all,
        emails,
        forPerson,
        unreadCount,
        markRead,
        markAllRead,
        notify,
        clearEmails,
        refresh,
      }}
    >
      {children}
    </NotifCtx.Provider>
  );
}

export function useNotifications(): Ctx {
  const c = useContext(NotifCtx);
  if (!c) {
    throw new Error(
      "useNotifications must be used within NotificationsProvider",
    );
  }
  return c;
}
