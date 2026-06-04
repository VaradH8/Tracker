"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  NOTIFICATIONS as SEED,
  firstNameToEmail,
  type AppNotification,
  type EmailLogEntry,
  type NotificationKind,
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
  forPerson: (person: string) => AppNotification[];
  unreadCount: (person: string) => number;
  markRead: (id: number) => void;
  markAllRead: (person: string) => void;
  notify: (n: NewNotification) => void;
  emails: EmailLogEntry[];
  clearEmails: () => void;
};

const NotifCtx = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<AppNotification[]>(SEED);
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);

  const forPerson = useCallback(
    (person: string) => all.filter((n) => n.recipient === person),
    [all],
  );

  const unreadCount = useCallback(
    (person: string) =>
      all.filter((n) => n.recipient === person && !n.read).length,
    [all],
  );

  const markRead = useCallback((id: number) => {
    setAll((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback((person: string) => {
    setAll((prev) =>
      prev.map((n) => (n.recipient === person ? { ...n, read: true } : n)),
    );
  }, []);

  const notify = useCallback((n: NewNotification) => {
    setAll((prev) => [
      {
        ...n,
        id: Math.max(0, ...prev.map((x) => x.id)) + 1,
        when: "just now",
        read: false,
      },
      ...prev,
    ]);
    // Every in-app notification also "sends" an email — captured in the
    // Settings → Email log so the team can verify what went out.
    setEmails((prev) => [
      {
        id: Math.max(0, ...prev.map((x) => x.id)) + 1,
        to: n.recipient,
        toEmail: firstNameToEmail(n.recipient),
        subject: n.title,
        body: n.body,
        when: "just now",
        kind: n.kind,
        taskId: n.taskId,
      },
      ...prev,
    ]);
  }, []);

  const clearEmails = useCallback(() => setEmails([]), []);

  return (
    <NotifCtx.Provider
      value={{
        all,
        forPerson,
        unreadCount,
        markRead,
        markAllRead,
        notify,
        emails,
        clearEmails,
      }}
    >
      {children}
    </NotifCtx.Provider>
  );
}

export function useNotifications(): Ctx {
  const c = useContext(NotifCtx);
  if (!c) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return c;
}
