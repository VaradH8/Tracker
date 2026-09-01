"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { DomainRole } from "./domain";

export type DomainMe = {
  id: string;
  email: string;
  name: string;
  role: DomainRole;
  /** Show only the Task log in the sidebar. See DomainShell. */
  taskLogOnly?: boolean;
};

type Ctx = {
  current: DomainMe | null;
  hydrated: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const DomainCtx = createContext<Ctx | null>(null);

export function DomainAuthProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DomainMe | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/domain/me", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { user: DomainMe | null };
        setCurrent(body.user);
      } else {
        setCurrent(null);
      }
    } catch {
      setCurrent(null);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/domain/auth/signout", { method: "POST" }).catch(() => null);
    setCurrent(null);
  }, []);

  return (
    <DomainCtx.Provider value={{ current, hydrated, refresh, signOut }}>
      {children}
    </DomainCtx.Provider>
  );
}

export function useDomain(): Ctx {
  const c = useContext(DomainCtx);
  if (!c) throw new Error("useDomain must be used within DomainAuthProvider");
  return c;
}