"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  CalendarCheck,
  ListTodo,
  Sun,
  Bell,
  ChevronDown,
  LogOut,
  Briefcase,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import {
  useRole,
  type Role,
  ROLE_LABELS,
  landingFor,
} from "@/lib/role";
import { canAccess } from "@/lib/access";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
};

const NAV: Record<Role, NavItem[]> = {
  Admin: [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { href: "/projects", label: "Projects", Icon: FolderKanban },
    { href: "/resources", label: "Resources", Icon: Users },
    { href: "/leaves", label: "Leaves", Icon: CalendarCheck },
    { href: "/settings", label: "Settings", Icon: Settings },
  ],
  Coordinator: [
    { href: "/my-day", label: "My Day", Icon: Sun },
    { href: "/projects", label: "Projects", Icon: FolderKanban },
    { href: "/my-tasks", label: "My Tasks", Icon: ListTodo },
    { href: "/resources", label: "Resources", Icon: Users },
    { href: "/leaves", label: "Leaves", Icon: CalendarCheck },
  ],
  BusinessDeveloper: [
    { href: "/projects", label: "Projects", Icon: FolderKanban },
    { href: "/clients", label: "Clients", Icon: Briefcase },
    { href: "/leaves", label: "Leaves", Icon: CalendarCheck },
  ],
  Developer: [
    { href: "/my-tasks", label: "My Tasks", Icon: ListTodo },
    { href: "/projects", label: "Projects", Icon: FolderKanban },
    { href: "/leaves", label: "Leaves", Icon: CalendarCheck },
  ],
};

const ROLE_COLOR: Record<Role, string> = {
  Admin: "bg-brand-red",
  Coordinator: "bg-brand-blue",
  BusinessDeveloper: "bg-brand-yellow",
  Developer: "bg-brand-green",
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function AppShell({ children }: { children: ReactNode }) {
  const [role, , hydrated] = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const items = NAV[role];
  const allowed = canAccess(role, pathname);

  useEffect(() => {
    if (!hydrated) return;
    if (!allowed) {
      router.replace(landingFor(role));
    }
  }, [hydrated, allowed, role, pathname, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-ink-50 grid place-items-center">
        <div className="text-sm text-ink-400">Loading…</div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-ink-50 grid place-items-center p-6">
        <div className="card p-8 max-w-md text-center">
          <h1 className="font-heading text-xl font-semibold mb-2">
            Redirecting…
          </h1>
          <p className="text-sm text-ink-500">
            That page isn't available for your role ({ROLE_LABELS[role]}).
            Taking you somewhere you can work.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50 flex">
      <Sidebar items={items} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar role={role} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-60 shrink-0 bg-white border-r border-ink-200 flex-col">
      <div className="h-14 flex items-center px-5 border-b border-ink-200">
        <Logo />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "flex items-center gap-3 px-3 py-2 rounded text-sm font-medium bg-brand-blueBg text-brand-blue"
                  : "flex items-center gap-3 px-3 py-2 rounded text-sm font-medium text-ink-700 hover:bg-ink-100"
              }
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 border-t border-ink-200 text-xs text-ink-400">
        v1.0
      </div>
    </aside>
  );
}

function TopBar({ role }: { role: Role }) {
  const { data: session } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);

  const name = session?.user?.name ?? ROLE_LABELS[role];
  const email = session?.user?.email ?? "";
  const initials = initialsFor(name);
  const color = ROLE_COLOR[role];

  return (
    <header className="h-14 bg-white border-b border-ink-200 flex items-center justify-end gap-2 px-6 sticky top-0 z-30">
      <div className="md:hidden mr-auto">
        <Logo size="sm" />
      </div>

      <button
        aria-label="Notifications"
        className="p-2 rounded-full text-ink-500 hover:bg-ink-100 relative"
      >
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-red" />
      </button>

      <div className="relative">
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-ink-100"
        >
          <div
            className={`w-8 h-8 rounded-full ${color} text-white grid place-items-center font-heading font-medium text-sm`}
          >
            {initials}
          </div>
          <span className="text-sm text-ink-700 hidden sm:block">
            {name.split(" ")[0]}
          </span>
          <ChevronDown size={14} className="text-ink-500" />
        </button>
        {profileOpen && (
          <div
            className="absolute right-0 mt-2 w-64 card p-2 z-50"
            onMouseLeave={() => setProfileOpen(false)}
          >
            <div className="px-3 py-2 border-b border-ink-100 mb-1">
              <div className="text-sm font-medium truncate">{name}</div>
              {email && (
                <div className="text-xs text-ink-500 truncate">{email}</div>
              )}
              <div className="text-xs text-ink-500 mt-0.5">
                Signed in as{" "}
                <span className="font-medium">{ROLE_LABELS[role]}</span>
              </div>
            </div>
            <Link
              href="/profile"
              onClick={() => setProfileOpen(false)}
              className="block px-3 py-1.5 rounded text-sm hover:bg-ink-100"
            >
              Profile
            </Link>
            {role === "Admin" && (
              <Link
                href="/settings"
                onClick={() => setProfileOpen(false)}
                className="block px-3 py-1.5 rounded text-sm hover:bg-ink-100"
              >
                Settings
              </Link>
            )}
            <hr className="my-1 border-ink-100" />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-ink-700 hover:bg-ink-100 w-full text-left"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
