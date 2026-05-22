"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Calendar, Briefcase, CheckSquare } from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  landingFor,
  writeStoredRole,
  readLastRole,
  type Role,
} from "@/lib/role";

type RoleTile = {
  key: Role;
  who: string;
  role: string;
  Icon: typeof Shield;
  /** border + icon accent for per-role muscle memory */
  border: string;
  accent: string;
};

const TILES: RoleTile[] = [
  {
    key: "Admin",
    who: "Varad Hadawale",
    role: "Admin",
    Icon: Shield,
    border: "border-l-brand-red",
    accent: "bg-brand-redBg text-brand-redText",
  },
  {
    key: "Coordinator",
    who: "Manasi Kulkarni",
    role: "Co-ordinator",
    Icon: Calendar,
    border: "border-l-brand-blue",
    accent: "bg-brand-blueBg text-brand-blue",
  },
  {
    key: "BusinessDeveloper",
    who: "Rohit Mehra",
    role: "Business Developer",
    Icon: Briefcase,
    border: "border-l-brand-yellow",
    accent: "bg-brand-yellowBg text-brand-yellowText",
  },
  {
    key: "Developer",
    who: "Sanjana Rao",
    role: "Developer",
    Icon: CheckSquare,
    border: "border-l-brand-green",
    accent: "bg-brand-greenBg text-brand-greenText",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [lastRole, setLastRole] = useState<Role | null>(null);

  useEffect(() => {
    setLastRole(readLastRole());
    // Clear any stale auth cookies from earlier deploys.
    fetch("/api/signout", { method: "GET", redirect: "manual" }).catch(
      () => {},
    );
  }, []);

  function pickRole(tile: RoleTile) {
    writeStoredRole(tile.key);
    router.replace(landingFor(tile.key));
  }

  // Put the last-used role first for muscle memory.
  const ordered = lastRole
    ? [
        ...TILES.filter((t) => t.key === lastRole),
        ...TILES.filter((t) => t.key !== lastRole),
      ]
    : TILES;

  return (
    <main className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-200">
        <div className="max-w-[760px] mx-auto px-6 h-16 flex items-center">
          <Logo size="md" />
        </div>
      </header>

      <div className="max-w-[760px] mx-auto px-6 py-12">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold mb-1">
            Pick your name
          </h1>
          <p className="text-sm text-ink-400">
            Internal tool · choose an account to sign in
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ordered.map((tile) => {
            const Icon = tile.Icon;
            const isLast = tile.key === lastRole;
            return (
              <button
                key={tile.key}
                onClick={() => pickRole(tile)}
                autoFocus={isLast}
                className={`card text-left transition flex items-center gap-4 p-4 border-l-4 ${tile.border} hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-brand-blue ${
                  isLast ? "ring-2 ring-brand-blue" : ""
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-card grid place-items-center shrink-0 ${tile.accent}`}
                >
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-semibold text-ink-900 truncate">
                    {tile.who}
                  </div>
                  <div className="text-xs text-ink-500">{tile.role}</div>
                </div>
                {isLast && (
                  <span className="pill-blue text-[10px] py-0 shrink-0">
                    Last used
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
