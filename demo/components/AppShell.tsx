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
  ScrollText,
  Eye,
  Search,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { NotificationsPanel } from "./NotificationsPanel";
import { CommandPalette } from "./CommandPalette";
import {
  useRole,
  type Role,
  ROLE_LABELS,
  landingFor,
  readStoredRole,
  writeStoredRole,
  readImpersonator,
  startImpersonation,
  stopImpersonation,
} from "@/lib/role";
import { canAccess } from "@/lib/access";
import { useNotifications } from "@/lib/notifications-store";

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
    { href: "/users", label: "Users", Icon: Users },
    { href: "/audit", label: "Audit log", Icon: ScrollText },
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

const ROLE_PROFILE: Record<
  Role,
  { name: string; email: string; initials: string; color: string }
> = {
  Admin: {
    name: "Varad Hadawale",
    email: "varad@example.com",
    initials: "VH",
    color: "bg-brand-red",
  },
  Coordinator: {
    name: "Manasi Kulkarni",
    email: "manasi@example.com",
    initials: "MK",
    color: "bg-brand-blue",
  },
  BusinessDeveloper: {
    name: "Rohit Mehra",
    email: "rohit@example.com",
    initials: "RM",
    color: "bg-brand-yellow",
  },
  Developer: {
    name: "Sanjana Rao",
    email: "sanjana@example.com",
    initials: "SR",
    color: "bg-brand-green",
  },
};

export function AppShell({ children }: { children: ReactNode }) {
  const [role, , hydrated] = useRole();
  const router = useRouter();
  const pathname = usePathname();

  const isSignedIn = hydrated && readStoredRole() !== null;
  const impersonator = hydrated ? readImpersonator() : null;
  const allowed = canAccess(role, pathname);
  const items = NAV[role];

  useEffect(() => {
    if (!hydrated) return;
    if (!isSignedIn) {
      router.replace("/login");
      return;
    }
    if (!allowed) {
      router.replace(landingFor(role));
    }
  }, [hydrated, isSignedIn, allowed, role, router]);

  function exitImpersonation() {
    const original = impersonator;
    stopImpersonation();
    router.replace(landingFor(original ?? "Admin"));
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-ink-50 grid place-items-center">
        <div className="text-sm text-ink-400">Loading…</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-ink-50 grid place-items-center p-6">
        <div className="card p-8 max-w-md text-center">
          <h1 className="font-heading text-xl font-semibold mb-2">
            Sign in required
          </h1>
          <p className="text-sm text-ink-500">Taking you to the login page…</p>
        </div>
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
    <div className="min-h-screen bg-ink-50 flex flex-col">
      {impersonator && (
        <div className="sticky top-0 z-40 h-9 bg-brand-yellowText text-white flex items-center justify-center gap-3 px-4 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Eye size={13} />
            Viewing as <strong>{ROLE_PROFILE[role].name}</strong> (
            {ROLE_LABELS[role]})
          </span>
          <button
            onClick={exitImpersonation}
            className="underline hover:no-underline font-medium"
          >
            Exit view
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <Sidebar items={items} />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar role={role} impersonating={!!impersonator} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <CommandPalette />
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

function TopBar({
  role,
  impersonating,
}: {
  role: Role;
  impersonating: boolean;
}) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const profile = ROLE_PROFILE[role];
  const person = profile.name.split(" ")[0];
  const { unreadCount } = useNotifications();
  const unread = unreadCount(person);

  // Real Admin (not already impersonating) can View as another role.
  const canViewAs = role === "Admin" && !impersonating;

  function viewAs(target: Role) {
    setViewAsOpen(false);
    startImpersonation(target);
    router.replace(landingFor(target));
  }

  function signOut() {
    setProfileOpen(false);
    writeStoredRole(null);
    fetch("/api/signout", { method: "GET", redirect: "manual" }).finally(
      () => {
        router.replace("/login");
      },
    );
  }

  return (
    <header
      className={`h-14 bg-white border-b border-ink-200 flex items-center justify-end gap-2 px-6 sticky z-30 ${
        impersonating ? "top-9" : "top-0"
      }`}
    >
      <div className="md:hidden mr-auto">
        <Logo size="sm" />
      </div>

      <button
        onClick={() =>
          window.dispatchEvent(new Event("open-command-palette"))
        }
        className="hidden md:flex items-center gap-2 mr-auto px-3 py-1.5 rounded border border-ink-200 text-xs text-ink-400 hover:bg-ink-100"
        title="Search (Ctrl/Cmd + K)"
      >
        <Search size={14} />
        <span>Search…</span>
        <kbd className="border border-ink-200 rounded px-1 text-[10px]">
          ⌘K
        </kbd>
      </button>

      {canViewAs && (
        <div className="relative">
          <button
            onClick={() => setViewAsOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill border border-dashed border-ink-200 text-xs text-ink-500 hover:bg-ink-100"
            title="See the app as another role"
          >
            <Eye size={13} />
            View as
            <ChevronDown size={12} />
          </button>
          {viewAsOpen && (
            <div
              className="absolute right-0 mt-2 w-52 card p-1 z-50"
              onMouseLeave={() => setViewAsOpen(false)}
            >
              <div className="px-3 py-1.5 text-[11px] text-ink-400 uppercase tracking-wide font-semibold">
                Impersonate
              </div>
              {(
                ["Coordinator", "BusinessDeveloper", "Developer"] as Role[]
              ).map((r) => (
                <button
                  key={r}
                  onClick={() => viewAs(r)}
                  className="w-full text-left px-3 py-1.5 rounded text-sm hover:bg-ink-100"
                >
                  {ROLE_PROFILE[r].name}
                  <span className="text-ink-400"> · {ROLE_LABELS[r]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <button
          aria-label="Notifications"
          onClick={() => setNotifOpen((v) => !v)}
          className="p-2 rounded-full text-ink-500 hover:bg-ink-100 relative"
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-red text-white text-[10px] font-medium grid place-items-center">
              {unread}
            </span>
          )}
        </button>
        {notifOpen && (
          <NotificationsPanel
            person={person}
            onClose={() => setNotifOpen(false)}
          />
        )}
      </div>

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
            {profile.name.split(" ")[0]}
          </span>
          <ChevronDown size={14} className="text-ink-500" />
        </button>
        {profileOpen && (
          <div
            className="absolute right-0 mt-2 w-64 card p-2 z-50"
            onMouseLeave={() => setProfileOpen(false)}
          >
            <div className="px-3 py-2 border-b border-ink-100 mb-1">
              <div className="text-sm font-medium truncate">{profile.name}</div>
              <div className="text-xs text-ink-500 truncate">
                {profile.email}
              </div>
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
              type="button"
              onClick={signOut}
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
