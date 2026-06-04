"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { RESOURCES, firstNameOf } from "./mock";
import type { Role } from "./role";

/**
 * Local-first auth: accounts and the current session live in localStorage.
 * Passwords are stored in cleartext on the client only because this is a
 * single-machine demo; when the real backend is wired (NextAuth + Prisma +
 * bcrypt), this provider gets a server-backed implementation behind the
 * same hook surface — call sites don't have to change.
 */

export type Account = {
  id: number;
  name: string;
  email: string;
  role: Role;
  password: string;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
};

const ACCOUNTS_KEY = "tracker-accounts";
const SESSION_KEY = "tracker-session";
export const DEMO_DEFAULT_PASSWORD = "tracker2026";

function seedAccounts(): Account[] {
  return RESOURCES.filter((r) => r.status === "Active").map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.primaryRole,
    password: DEMO_DEFAULT_PASSWORD,
    active: true,
    createdAt: r.joined,
  }));
}

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
  signIn: (usernameOrEmail: string, password: string) => SignInResult;
  signOut: () => void;
  register: (input: RegisterInput) => SignInResult;
  changePassword: (
    currentPassword: string,
    nextPassword: string,
  ) => { ok: boolean; error?: string };
  updateAccount: (
    id: number,
    patch: Partial<
      Pick<Account, "name" | "email" | "role" | "password" | "active">
    >,
  ) => void;
  createAccount: (
    input: RegisterInput,
  ) => { ok: true; account: Account } | { ok: false; error: string };
};

const AccountsCtx = createContext<Ctx | null>(null);

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(() => seedAccounts());
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACCOUNTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAccounts(parsed as Account[]);
        }
      }
      const sess = window.localStorage.getItem(SESSION_KEY);
      if (sess) setCurrentId(Number(sess));
    } catch {
      // ignore — bad JSON or no storage. Fall back to seed.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {
      // quota or private mode — fine to ignore for the demo
    }
  }, [accounts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (currentId == null) window.localStorage.removeItem(SESSION_KEY);
      else window.localStorage.setItem(SESSION_KEY, String(currentId));
    } catch {
      /* ignore */
    }
  }, [currentId, hydrated]);

  const current = accounts.find((a) => a.id === currentId) ?? null;

  const signIn = useCallback(
    (usernameOrEmail: string, password: string): SignInResult => {
      const q = usernameOrEmail.trim().toLowerCase();
      if (!q || !password) {
        return { ok: false, error: "Enter your account and password." };
      }
      const acc = accounts.find(
        (a) =>
          a.email.toLowerCase() === q ||
          firstNameOf(a.name).toLowerCase() === q ||
          a.name.toLowerCase() === q,
      );
      if (!acc) return { ok: false, error: "No account matches that name." };
      if (!acc.active) {
        return { ok: false, error: "That account is deactivated." };
      }
      if (acc.password !== password) {
        return { ok: false, error: "Wrong password." };
      }
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === acc.id ? { ...a, lastLogin: "just now" } : a,
        ),
      );
      setCurrentId(acc.id);
      return { ok: true, account: acc };
    },
    [accounts],
  );

  const signOut = useCallback(() => setCurrentId(null), []);

  const register = useCallback(
    (input: RegisterInput): SignInResult => {
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      const password = input.password;
      if (!name) return { ok: false, error: "Name is required." };
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: "Enter a valid email address." };
      }
      if (!password || password.length < 6) {
        return {
          ok: false,
          error: "Password must be at least 6 characters.",
        };
      }
      if (accounts.some((a) => a.email.toLowerCase() === email)) {
        return { ok: false, error: "That email already has an account." };
      }
      const newAcc: Account = {
        id: Math.max(0, ...accounts.map((a) => a.id)) + 1,
        name,
        email,
        role: input.role,
        password,
        active: true,
        createdAt: "just now",
        lastLogin: "just now",
      };
      setAccounts((prev) => [...prev, newAcc]);
      setCurrentId(newAcc.id);
      return { ok: true, account: newAcc };
    },
    [accounts],
  );

  /** Admin "Add user" — creates an account without signing into it. */
  const createAccount = useCallback(
    (input: RegisterInput) => {
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      const password = input.password;
      if (!name) return { ok: false as const, error: "Name is required." };
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false as const, error: "Enter a valid email address." };
      }
      if (!password || password.length < 6) {
        return {
          ok: false as const,
          error: "Password must be at least 6 characters.",
        };
      }
      if (accounts.some((a) => a.email.toLowerCase() === email)) {
        return {
          ok: false as const,
          error: "That email already has an account.",
        };
      }
      const newAcc: Account = {
        id: Math.max(0, ...accounts.map((a) => a.id)) + 1,
        name,
        email,
        role: input.role,
        password,
        active: true,
        createdAt: "just now",
      };
      setAccounts((prev) => [...prev, newAcc]);
      return { ok: true as const, account: newAcc };
    },
    [accounts],
  );

  const changePassword = useCallback(
    (currentPassword: string, nextPassword: string) => {
      if (!current) return { ok: false, error: "Not signed in." };
      if (current.password !== currentPassword) {
        return { ok: false, error: "Current password doesn't match." };
      }
      if (!nextPassword || nextPassword.length < 6) {
        return {
          ok: false,
          error: "New password must be at least 6 characters.",
        };
      }
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === current.id ? { ...a, password: nextPassword } : a,
        ),
      );
      return { ok: true };
    },
    [current],
  );

  const updateAccount = useCallback(
    (
      id: number,
      patch: Partial<
        Pick<Account, "name" | "email" | "role" | "password" | "active">
      >,
    ) => {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

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
