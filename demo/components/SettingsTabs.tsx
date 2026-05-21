"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/import", label: "Import" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-ink-200 mb-6 flex items-center gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active =
          t.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? "px-4 py-2 text-sm font-medium border-b-2 border-brand-blue text-brand-blue whitespace-nowrap"
                : "px-4 py-2 text-sm font-medium text-ink-500 hover:text-ink-900 whitespace-nowrap"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
