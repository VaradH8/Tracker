"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { firstNameOf } from "./mock";
import type { Role } from "./role";

/**
 * Real auth: cookies + DB sessions. The provider mirrors the previous
 * localStorage surface so consumers don't have to change, but every call
 * now goes to the server. See lib/auth.ts for the implementation.
 */

export type Account = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  isAdmin?: boolean;
  createdAt?: string;
  lastLogin?: string | null;
  designation?: string;
  phone?: string;
  location?: string;
  hourlyRate?: number;
  capacityPerWeek?: number;
};

export const DEMO_DEFAULT_PASSWORD = "tracker2026";

type SignInResult =
  | { ok: true; account: Account }
  | { ok: false; error: string };

type RegisterInput = {
  name: string;
  email: string;
  role: Role;
  password: string;
};

type Ctx = {
  accounts: Account[];
  current: Account | null;
  hydrated: boolean;
  signIn: (
    usernameOrEmail: string,
    password: string,
  ) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  register: (input: RegisterInput) => Promise<SignInResult>;
  changePassword: (
    currentPassword: string,
    nextPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  updateAccount: (
    id: string,
    patch: Partial<
      Pick<
        Account,
        | "name"
        | "email"
        | "role"
        | "active"
        | "designation"
        | "phone"
        | "location"
        | "hourlyRate"
        | "capacityPerWeek"
      > & {
        password?: string;
      }
    >,
  ) => Promise<void>;
  createAccount: (
    input: RegisterInput,
  ) => Promise<{ ok: true; account: Account } | { ok: false; error: string }>;
  deleteAccount: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

const AccountsCtx = createContext<Ctx | null>(null);

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [current, setCurrent] = useState<Account | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate on mount: read /api/me to learn who's signed in, then pull
  // the roster from /api/users (the API itself decides what's visible).
  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, []);

  async function refresh() {
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (meRes.ok) {
        const me = (await meRes.json()) as {
          id: string;
          name: string;
          email: string;
          role: Role;
          isAdmin: boolean;
        };
        const acc: Account = {
          id: me.id,
          name: me.name,
          email: me.email,
          role: me.role,
          active: true,
          isAdmin: me.isAdmin,
        };
        setCurrent(acc);
        await refreshAccounts();
      } else {
        setCurrent(null);
        setAccounts([]);
      }
    } catch {
      setCurrent(null);
    }
  }

  async function refreshAccounts() {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { users: Account[] };
      setAccounts(body.users ?? []);
    } catch {
      /* ignore */
    }
  }

  const signIn = useCallback(
    async (usernameOrEmail: string, password: string): Promise<SignInResult> => {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: usernameOrEmail, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error ?? "Sign-in failed." };
      }
      const body = (await res.json()) as {
        user: { id: string; name: string; email: string; role: Role; isAdmin: boolean };
      };
      const acc: Account = {
        id: body.user.id,
        name: body.user.name,
        email: body.user.email,
        role: body.user.role,
        active: true,
        isAdmin: body.user.isAdmin,
      };
      setCurrent(acc);
      void refreshAccounts();
      return { ok: true, account: acc };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
    setCurrent(null);
    setAccounts([]);
  }, []);

  const register = useCallback(
    async (input: RegisterInput): Promise<SignInResult> => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error ?? "Couldn't create account." };
      }
      const body = (await res.json()) as {
        user: { id: string; name: string; email: string; role: Role; isAdmin: boolean };
      };
      const acc: Account = {
        id: body.user.id,
        name: body.user.name,
        email: body.user.email,
        role: body.user.role,
        active: true,
        isAdmin: body.user.isAdmin,
      };
      setCurrent(acc);
      void refreshAccounts();
      return { ok: true, account: acc };
    },
    [],
  );

  const changePassword = useCallback(
    async (currentPassword: string, nextPassword: string) => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error ?? "Couldn't change password." };
      }
      return { ok: true };
    },
    [],
  );

  const updateAccount = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          Account,
          | "name"
          | "email"
          | "role"
          | "active"
          | "designation"
          | "phone"
          | "location"
          | "hourlyRate"
          | "capacityPerWeek"
        > & {
          password?: string;
        }
      >,
    ) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (body.user) {
        setAccounts((prev) =>
          prev.map((a) => (a.id === id ? (body.user as Account) : a)),
        );
        if (current && current.id === id) setCurrent(body.user as Account);
      }
    },
    [current],
  );

  const createAccount = useCallback(
    async (input: RegisterInput) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          ok: false as const,
          error: body.error ?? "Couldn't create account.",
        };
      }
      const body = (await res.json()) as { user: Account };
      setAccounts((prev) => [...prev, body.user]);
      return { ok: true as const, account: body.user };
    },
    [],
  );

  const deleteAccount = useCallback(async (id: string) => {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Couldn't delete account." };
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    return { ok: true };
  }, []);

  return (
    <AccountsCtx.Provider
      value={{
        accounts,
        current,
        hydrated,
        signIn,
        signOut,
        register,
        changePassword,
        updateAccount,
        createAccount,
        deleteAccount,
      }}
    >
      {children}
    </AccountsCtx.Provider>
  );
}

export function useAccounts(): Ctx {
  const c = useContext(AccountsCtx);
  if (!c) throw new Error("useAccounts must be used within AccountsProvider");
  return c;
}

/** The signed-in user's first name. Empty string when no session. */
export function useMyFirstName(): string {
  const { current } = useAccounts();
  return current ? firstNameOf(current.name) : "";
}
