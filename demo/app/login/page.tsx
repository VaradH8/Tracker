"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useRole, landingFor, type Role, ROLE_LABELS } from "@/lib/role";

const ROLE_BLURB: Record<Role, string> = {
  Admin: "Org-wide health, resources, settings",
  Coordinator: "Plan projects, run the day, unblock the team",
  BusinessDeveloper: "Project pipeline, client info, intake",
  Developer: "Today's tasks, status updates, remarks",
};

const ROLE_TONE: Record<Role, string> = {
  Admin:
    "border-brand-red bg-brand-redBg text-brand-redText",
  Coordinator:
    "border-brand-blue bg-brand-blueBg text-brand-blue",
  BusinessDeveloper:
    "border-brand-yellow bg-brand-yellowBg text-brand-yellowText",
  Developer:
    "border-brand-green bg-brand-greenBg text-brand-greenText",
};

const ROLES: Role[] = ["Admin", "Coordinator", "BusinessDeveloper", "Developer"];

export default function LoginPage() {
  const router = useRouter();
  const [, setRole] = useRole();
  const [email, setEmail] = useState("manasi@example.com");
  const [password, setPassword] = useState("demo");
  const [as, setAs] = useState<Role>("Coordinator");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRole(as);
    router.push(landingFor(as));
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-brand-blueBg to-white">
        <Link href="/" className="inline-flex">
          <Logo size="lg" />
        </Link>
        <div>
          <h2 className="font-heading text-3xl font-semibold text-ink-900 leading-tight max-w-md">
            Run projects.
            <br />
            See who's doing what.
          </h2>
          <p className="text-ink-500 mt-4 max-w-md">
            A role-aware tool for engineering services teams — projects,
            tasks, resources, and the signals that matter, without the
            spreadsheet glue.
          </p>
        </div>
        <div className="text-xs text-ink-400">
          Demo build · powered by mocked data
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-md">
          <Link href="/" className="lg:hidden mb-8 inline-flex">
            <Logo size="lg" />
          </Link>
          <h1 className="font-heading text-2xl font-semibold mb-1">
            Welcome back
          </h1>
          <p className="text-ink-500 text-sm mb-8">
            Sign in to your Task Manager account.
          </p>

          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
            placeholder="you@company.com"
          />

          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 mb-5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
          />

          <div className="mb-6">
            <label className="block text-xs font-medium text-ink-700 mb-2">
              Sign in as <span className="text-ink-400">(demo only)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAs(r)}
                  className={
                    as === r
                      ? `px-3 py-2.5 rounded border-2 ${ROLE_TONE[r]} text-left transition-all`
                      : "px-3 py-2.5 rounded border border-ink-200 text-left hover:bg-ink-100 transition-colors"
                  }
                >
                  <div className="text-sm font-medium">{ROLE_LABELS[r]}</div>
                  <div className="text-[11px] mt-0.5 opacity-75">
                    {ROLE_BLURB[r]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>

          <p className="text-xs text-ink-400 mt-6 text-center">
            Demo mode · pick a role and click sign in · use the role switcher
            in the header to flip later
          </p>
        </form>
      </div>
    </main>
  );
}
