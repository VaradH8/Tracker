"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";
import { useRole, type Role, landingFor } from "@/lib/role";
import { ADMIN_USER, CURRENT_USER, USER_USER } from "@/lib/mock";

type Tab = { href: string; label: string };

const TABS: Record<Role, Tab[]> = {
  Admin: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/admin/teams", label: "Teams" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/audit", label: "Audit" },
    { href: "/admin/import", label: "Import" },
  ],
  Manager: [
    { href: "/my-day", label: "My Day" },
    { href: "/team-board", label: "Team Board" },
    { href: "/my-tasks", label: "My Tasks" },
    { href: "/admin/audit", label: "Audit" },
  ],
  User: [
    { href: "/my-day", label: "My Day" },
    { href: "/my-tasks", label: "My Tasks" },
    { href: "/team-board", label: "Team Boards" },
  ],
};

const PROFILE: Record<Role, { name: string; first: string; initials: string; color: string }> = {
  Admin: {
    name: ADMIN_USER.name,
    first: ADMIN_USER.firstName,
    initials: "VH",
    color: "bg-brand-red",
  },
  Manager: {
    name: CURRENT_USER.name,
    first: CURRENT_USER.firstName,
    initials: "MK",
    color: "bg-brand-blue",
  },
  User: {
    name: USER_USER.name,
    first: USER_USER.firstName,
    initials: "SR",
    color: "bg-brand-green",
  },
};

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useRole();
  const [profileOpen, setProfileOpen] = useState(false);
  const tabs = TABS[role];
  const profile = PROFILE[role];

  function switchRole(r: Role) {
    setRole(r);
    setProfileOpen(false);
    router.push(landingFor(r));
  }

  return (
    <header className="bg-white border-b border-ink-200 sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((t) => {
              const active =
                pathname === t.href ||
                (t.href !== "/my-day" && pathname.startsWith(t.href));
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={
                    active
                      ? "px-3 py-1.5 rounded-pill text-sm font-medium bg-brand-blueBg text-brand-blue"
                      : "px-3 py-1.5 rounded-pill text-sm font-medium text-ink-700 hover:bg-ink-100"
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <RoleSwitcher role={role} onSwitch={switchRole} />
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
                    Signed in as <span className="font-medium">{role}</span>
                  </div>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="block px-3 py-1.5 rounded text-sm hover:bg-ink-100"
                >
                  Profile
                </Link>
                <Link
                  href="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="block px-3 py-1.5 rounded text-sm hover:bg-ink-100"
                >
                  Notification preferences
                </Link>
                {role === "Admin" && (
                  <Link
                    href="/admin/settings"
                    onClick={() => setProfileOpen(false)}
                    className="block px-3 py-1.5 rounded text-sm hover:bg-ink-100"
                  >
                    System settings
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
        </div>
      </div>
    </header>
  );
}

function RoleSwitcher({
  role,
  onSwitch,
}: {
  role: Role;
  onSwitch: (r: Role) => void;
}) {
  const [open, setOpen] = useState(false);
  const roles: Role[] = ["Admin", "Manager", "User"];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill border border-dashed border-ink-200 text-xs text-ink-500 hover:bg-ink-100"
        title="Demo role switcher"
      >
        <span className="text-ink-400">View as</span>
        <span className="font-medium text-ink-900">{role}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-44 card p-1 z-50"
          onMouseLeave={() => setOpen(false)}
        >
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => {
                onSwitch(r);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 rounded text-sm hover:bg-ink-100 ${
                role === r ? "bg-brand-blueBg text-brand-blue" : ""
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
