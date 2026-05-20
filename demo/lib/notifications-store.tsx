"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { NOTIFICATIONS as SEED, type AppNotification } from "./mock";

type Ctx = {
  all: AppNotification[];
  forPerson: (person: string) => AppNotification[];
  unreadCount: (person: string) => number;
  markRead: (id: number) => void;
  markAllRead: (person: string) => void;
};

const NotifCtx = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<AppNotification[]>(SEED);

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

  return (
    <NotifCtx.Provider
      value={{ all, forPerson, unreadCount, markRead, markAllRead }}
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
