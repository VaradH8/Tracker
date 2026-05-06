"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useRole, landingFor, type Role } from "@/lib/role";

export default function LoginPage() {
  const router = useRouter();
  const [, setRole] = useRole();
  const [email, setEmail] = useState("manasi@example.com");
  const [password, setPassword] = useState("demo");
  const [as, setAs] = useState<Role>("Manager");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRole(as);
    router.push(landingFor(as));
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-brand-blueBg to-white">
        <Logo size="lg" />
        <div>
          <h2 className="font-heading text-3xl font-semibold text-ink-900 leading-tight max-w-md">
            Replace the spreadsheet.
            <br />
            Keep the rhythm.
          </h2>
          <p className="text-ink-500 mt-4 max-w-md">
            A lightweight, role-aware tracker for the seven engineering teams —
            with proper notifications, audit trail, and one-click exports back
            to Excel for leadership.
          </p>
          <div className="mt-10 flex items-center gap-2 text-xs text-ink-500">
            <span className="pill-blue">Manager</span>
            <span className="pill-yellow">Admin</span>
            <span className="pill-grey">User</span>
            <span>· three roles, server-enforced</span>
          </div>
        </div>
        <div className="text-xs text-ink-400">
          MVP demo · powered by mocked data
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Logo size="lg" />
          </div>
          <h1 className="font-heading text-2xl font-semibold mb-1">
            Welcome back
          </h1>
          <p className="text-ink-500 text-sm mb-8">
            Sign in to your Project Tracker account.
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
            className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
          />

          <div className="mb-6">
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Sign in as <span className="text-ink-400">(demo only)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Admin", "Manager", "User"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAs(r)}
                  className={
                    as === r
                      ? "px-3 py-2 rounded border-2 border-brand-blue bg-brand-blueBg text-brand-blue text-sm font-medium"
                      : "px-3 py-2 rounded border border-ink-200 text-sm text-ink-700 hover:bg-ink-100"
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>

          <p className="text-xs text-ink-400 mt-6 text-center">
            Demo mode · pick a role and click sign in · use the role switcher in
            the header to flip later
          </p>
        </form>
      </div>
    </main>
  );
}
