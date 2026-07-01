"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, FolderKanban, ClipboardList, Users, Gauge, LogOut, KeyRound } from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  roles: DomainRole[];
};

const NAV: NavItem[] = [
  { href: "/domain", label: "Dashboard", icon: LayoutGrid, roles: ["Admin", "Lead", "TeamLead", "Actionee"] },
  { href: "/domain/projects", label: "Projects", icon: FolderKanban, roles: ["Admin", "Lead", "TeamLead", "Actionee"] },
  { href: "/domain/worklog", label: "Work log", icon: ClipboardList, roles: ["Admin", "Lead", "TeamLead", "Actionee"] },
  { href: "/domain/availability", label: "Availability", icon: Gauge, roles: ["Admin"] },
  { href: "/domain/users", label: "Users", icon: Users, roles: ["Admin"] },
];

export function DomainShell({ children }: { children: ReactNode }) {
  const { current, signOut } = useDomain();
  const pathname = usePathname();
  const router = useRouter();
  if (!current) return null;

  const items = NAV.filter((n) => n.roles.includes(current.role));

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-200 sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center gap-6">
          <Link href="/domain" className="flex items-center gap-2 shrink-0">
            <span className="w-7 h-7 rounded bg-brand-blue text-white grid place-items-center font-heading font-bold text-sm">
              D
            </span>
            <span className="font-heading font-semibold">Domain</span>
          </Link>
          <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
            {items.map((n) => {
              const active =
                n.href === "/domain"
                  ? pathname === "/domain"
                  : pathname.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${
                    active
                      ? "bg-brand-blueBg text-brand-blue"
                      : "text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  <Icon size={15} /> {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/domain/account"
              className="text-right leading-tight rounded px-1 hover:bg-ink-100"
              title="Account & password"
            >
              <div className="text-sm font-medium text-ink-900">{current.name}</div>
              <div className="text-[11px] text-ink-500">
                {DOMAIN_ROLE_LABELS[current.role]}
              </div>
            </Link>
            <Link
              href="/domain/account"
              className="p-2 rounded hover:bg-ink-100 text-ink-500"
              title="Account & password"
              aria-label="Account and password"
            >
              <KeyRound size={16} />
            </Link>
            <button
              onClick={async () => {
                await signOut();
                router.replace("/login?domain=1");
              }}
              className="p-2 rounded hover:bg-ink-100 text-ink-500"
              title="Sign out of Domain"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}