"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import {
  ADMIN_USER,
  BD_USER,
  CURRENT_USER,
  DEVELOPER_USER,
} from "@/lib/mock";

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

const PROFILE: Record<
  Role,
  { name: string; first: string; initials: string; color: string }
> = {
  Admin: {
    name: ADMIN_USER.name,
    first: ADMIN_USER.firstName,
    initials: "VH",
    color: "bg-brand-red",
  },
  Coordinator: {
    name: CURRENT_USER.name,
    first: CURRENT_USER.firstName,
    initials: "MK",
    color: "bg-brand-blue",
  },
  BusinessDeveloper: {
    name: BD_USER.name,
    first: BD_USER.firstName,
    initials: "RM",
    color: "bg-brand-yellow",
  },
  Developer: {
    name: DEVELOPER_USER.name,
    first: DEVELOPER_USER.firstName,
    initials: "SR",
    color: "bg-brand-green",
  },
};

export function AppShell({ children }: { children: ReactNode }) {
  const [role] = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const items = NAV[role];

  useEffect(() => {
    if (!canAccess(role, pathname)) {
      router.replace(landingFor(role));
    }
  }, [role, pathname, router]);

  if (!canAccess(role, pathname)) {
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
        <TopBar />
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
        v0.2.0 · demo
      </div>
    </aside>
  );
}

function TopBar() {
  const router = useRouter();
  const [role, setRole] = useRole();
  const [profileOpen, setProfileOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const profile = PROFILE[role];

  function switchRole(r: Role) {
    setRole(r);
    setRoleOpen(false);
    router.push(landingFor(r));
  }

  return (
    <header className="h-14 bg-white border-b border-ink-200 flex items-center justify-end gap-2 px-6 sticky top-0 z-30">
      <div className="md:hidden mr-auto">
        <Logo size="sm" />
      </div>

      <div className="relative">
        <button
          onClick={() => setRoleOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill border border-dashed border-ink-200 text-xs text-ink-500 hover:bg-ink-100"
          title="Demo role switcher"
        >
          <span className="text-ink-400">View as</span>
          <span className="font-medium text-ink-900">
            {ROLE_LABELS[role]}
          </span>
          <ChevronDown size={12} />
        </button>
        {roleOpen && (
          <div
            className="absolute right-0 mt-2 w-52 card p-1 z-50"
            onMouseLeave={() => setRoleOpen(false)}
          >
            {(
              [
                "Admin",
                "Coordinator",
                "BusinessDeveloper",
                "Developer",
              ] as Role[]
            ).map((r) => (
              <button
                key={r}
                onClick={() => switchRole(r)}
                className={`w-full text-left px-3 py-1.5 rounded text-sm hover:bg-ink-100 ${
                  role === r ? "bg-brand-blueBg text-brand-blue" : ""
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
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
            className={`w-8 h-8 rounded-full ${profile.color} text-white grid place-items-center font-heading font-medium text-sm`}
          >
            {profile.initials}
          </div>
          <span className="text-sm text-ink-700 hidden sm:block">
            {profile.first}
          </span>
          <ChevronDown size={14} className="text-ink-500" />
        </button>
        {profileOpen && (
          <div
            className="absolute right-0 mt-2 w-64 card p-2 z-50"
            onMouseLeave={() => setProfileOpen(false)}
          >
            <div className="px-3 py-2 border-b border-ink-100 mb-1">
              <div className="text-sm font-medium">{profile.name}</div>
              <div className="text-xs text-ink-500">
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
            <Link
              href="/login"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-ink-700 hover:bg-ink-100"
            >
              <LogOut size={14} /> Sign out
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
