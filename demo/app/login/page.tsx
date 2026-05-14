"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Briefcase,
  Code,
  ChevronRight,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { landingFor, writeStoredRole, type Role } from "@/lib/role";

type RoleTile = {
  key: Role;
  label: string;
  who: string;
  blurb: string;
  lands: string;
  Icon: typeof Shield;
  tone: string;
};

const TILES: RoleTile[] = [
  {
    key: "Admin",
    label: "Admin",
    who: "Varad Hadawale",
    blurb: "Org-wide health · users · settings",
    lands: "/dashboard",
    Icon: Shield,
    tone: "border-brand-red bg-brand-redBg text-brand-redText",
  },
  {
    key: "Coordinator",
    label: "Co-ordinator",
    who: "Manasi Kulkarni",
    blurb: "Plan projects · resources · unblock the team",
    lands: "/my-day",
    Icon: Users,
    tone: "border-brand-blue bg-brand-blueBg text-brand-blue",
  },
  {
    key: "BusinessDeveloper",
    label: "Business Developer",
    who: "Rohit Mehra",
    blurb: "Project pipeline · clients · intake",
    lands: "/projects",
    Icon: Briefcase,
    tone: "border-brand-yellow bg-brand-yellowBg text-brand-yellowText",
  },
  {
    key: "Developer",
    label: "Developer",
    who: "Sanjana Rao",
    blurb: "Today's tasks · status updates · remarks",
    lands: "/my-tasks",
    Icon: Code,
    tone: "border-brand-green bg-brand-greenBg text-brand-greenText",
  },
];

export default function LoginPage() {
  const router = useRouter();

  // Clear any stale auth cookies from previous deploys when the page loads,
  // just to be safe. localStorage is the source of truth now.
  useEffect(() => {
    fetch("/api/signout", { method: "GET", redirect: "manual" }).catch(
      () => {},
    );
  }, []);

  function pickRole(tile: RoleTile) {
    writeStoredRole(tile.key);
    router.replace(landingFor(tile.key));
  }

  return (
    <main className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-200">
        <div className="max-w-[1100px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex">
            <Logo size="md" />
          </Link>
          <Link
            href="/"
            className="text-sm text-ink-500 hover:text-brand-blue"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <div className="max-w-[900px] mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-semibold mb-2">
            Sign in to Task Manager
          </h1>
          <p className="text-ink-500">
            Pick the role you want to sign in as.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {TILES.map((tile) => {
            const Icon = tile.Icon;
            return (
              <button
                key={tile.key}
                onClick={() => pickRole(tile)}
                className="card p-5 text-left transition group hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-card grid place-items-center border-2 ${tile.tone}`}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-heading text-base font-semibold">
                        {tile.label}
                      </h2>
                      <ChevronRight
                        size={14}
                        className="text-ink-400 group-hover:text-brand-blue group-hover:translate-x-0.5 transition"
                      />
                    </div>
                    <p className="text-xs text-ink-500 mb-2">{tile.blurb}</p>
                    <div className="text-[11px] text-ink-400">
                      Signed in as <span className="text-ink-700">{tile.who}</span>{" "}
                      · lands on <code>{tile.lands}</code>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-ink-400">
          Pre-launch build · session is browser-local · pick a role to enter
        </p>
      </div>
    </main>
  );
}
