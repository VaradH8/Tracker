"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutGrid,
  FolderKanban,
  ClipboardList,
  Users,
  Gauge,
  BarChart3,
  LogOut,
  KeyRound,
  TrendingUp,
  Tags,
  CheckSquare,
  Menu,
  X,
} from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import { BRAND_NAVY, BrandPanel } from "@/components/InventiveBrand";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  roles: DomainRole[];
  /** Items are grouped so nine destinations still read as two short lists. */
  group: "Work" | "Manage";
};

const WORKERS: DomainRole[] = ["TeamLead", "SME", "Actionee"];
const EVERYONE: DomainRole[] = ["Admin", "Lead", ...WORKERS];
/** Structural screens: adding and removing people. */
const MANAGERS: DomainRole[] = ["Admin", "Lead"];
/** Delivery oversight — a Team Lead reviews and plans here too. */
const SUPERVISORS: DomainRole[] = [...MANAGERS, "TeamLead"];

const NAV: NavItem[] = [
  { href: "/engineering", label: "Dashboard", icon: LayoutGrid, roles: EVERYONE, group: "Work" },
  { href: "/engineering/projects", label: "Projects", icon: FolderKanban, roles: EVERYONE, group: "Work" },
  { href: "/engineering/my-tags", label: "My tags", icon: Tags, roles: WORKERS, group: "Work" },
  { href: "/engineering/task-log", label: "Task log", icon: ClipboardList, roles: EVERYONE, group: "Work" },
  { href: "/engineering/approvals", label: "Approvals", icon: CheckSquare, roles: SUPERVISORS, group: "Manage" },
  { href: "/engineering/forecast", label: "Forecast", icon: TrendingUp, roles: SUPERVISORS, group: "Manage" },
  { href: "/engineering/availability", label: "Resource availability", icon: Gauge, roles: SUPERVISORS, group: "Manage" },
  { href: "/engineering/kpis", label: "KPIs", icon: BarChart3, roles: ["Admin"], group: "Manage" },
  // Everyone who supervises manages people here, but not equally: Admins
  // and Leads add and remove accounts, while a Team Lead only edits the
  // SMEs and Actionees they oversee. The page adapts; the nav just lets
  // them reach it.
  { href: "/engineering/users", label: "People", icon: Users, roles: SUPERVISORS, group: "Manage" },
];

const GROUPS: NavItem["group"][] = ["Work", "Manage"];

function isActive(pathname: string, href: string): boolean {
  return href === "/engineering" ? pathname === "/engineering" : pathname.startsWith(href);
}

/**
 * Left rail navigation.
 *
 * The nav used to run across the top, which became a horizontally
 * scrolling strip once a Lead had nine destinations. A vertical rail gives
 * every item a full label, room to group them, and hands the top of each
 * page back to that page's own heading.
 *
 * Below `lg` the rail becomes a slide-over behind a menu button, so narrow
 * screens keep their full width for content.
 */
export function DomainShell({ children }: { children: ReactNode }) {
  const { current, signOut } = useDomain();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // A tap that navigates should also dismiss the drawer.
  useEffect(() => setOpen(false), [pathname]);

  if (!current) return null;

  const items = NAV.filter((n) => n.roles.includes(current.role));

  const rail = (
    <>
      {/* The brand panel. Dark by necessity as much as by design — the
          logo's wordmark is white, so it needs the ground it was drawn
          for. See components/InventiveBrand. */}
      <Link
        href="/engineering"
        className="shrink-0 border-b border-ink-200"
        aria-label="Engineering home"
      >
        <BrandPanel label="Engineering" className="px-5 h-16" height={30} />
      </Link>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {GROUPS.map((group) => {
          const groupItems = items.filter((n) => n.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="mb-5">
              <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {group}
              </div>
              <ul className="space-y-0.5">
                {groupItems.map((n) => {
                  const active = isActive(pathname, n.href);
                  const Icon = n.icon;
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-sm font-medium transition ${
                          active
                            ? "bg-brand-blueBg text-brand-blue"
                            : "text-ink-600 hover:bg-ink-100"
                        }`}
                      >
                        <Icon size={16} className="shrink-0" />
                        <span className="truncate">{n.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-ink-200 p-3 shrink-0">
        <Link
          href="/engineering/account"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded hover:bg-ink-100"
          title="Account & password"
        >
          <span className="w-8 h-8 rounded-pill bg-ink-100 text-ink-600 grid place-items-center text-xs font-semibold shrink-0">
            {current.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-900 truncate">
              {current.name}
            </span>
            <span className="block text-[11px] text-ink-500">
              {DOMAIN_ROLE_LABELS[current.role]}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1 mt-1">
          <Link
            href="/engineering/account"
            className="flex-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-ink-600 hover:bg-ink-100"
          >
            <KeyRound size={13} /> Account
          </Link>
          <button
            onClick={async () => {
              await signOut();
              router.replace("/login?engineering=1");
            }}
            className="flex-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-ink-600 hover:bg-ink-100"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Narrow screens: a slim bar carrying the menu button. */}
      <header
        className="lg:hidden sticky top-0 z-30 border-b border-ink-200 h-14 flex items-center gap-3 px-4"
        style={{ background: BRAND_NAVY }}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-2 rounded hover:bg-white/10 text-white/80"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <Link href="/engineering" aria-label="Engineering home">
          <BrandPanel label="Engineering" height={24} subdued />
        </Link>
      </header>

      {/* The rail, fixed on wide screens. */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 bg-white border-r border-ink-200 flex-col z-20">
        {rail}
      </aside>

      {/* Slide-over for narrow screens. */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-ink-900/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white border-r border-ink-200 flex flex-col">
            {/* Sits on the dark brand panel, so it is styled light —
                ink-500 on navy was very nearly invisible. */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-5 right-3 p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white z-10"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
            {rail}
          </aside>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="max-w-[1280px] mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
