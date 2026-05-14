"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  AlertCircle,
  Shield,
  Users,
  Briefcase,
  Code,
  ChevronRight,
} from "lucide-react";
import { Logo } from "@/components/Logo";

type RoleTile = {
  key: "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";
  label: string;
  email: string;
  blurb: string;
  lands: string;
  Icon: typeof Shield;
  tone: string;
};

const TILES: RoleTile[] = [
  {
    key: "Admin",
    label: "Admin",
    email: "varad@example.com",
    blurb: "Org-wide health · users · settings",
    lands: "/dashboard",
    Icon: Shield,
    tone: "border-brand-red bg-brand-redBg text-brand-redText",
  },
  {
    key: "Coordinator",
    label: "Co-ordinator",
    email: "manasi@example.com",
    blurb: "Plan projects · resources · unblock the team",
    lands: "/my-day",
    Icon: Users,
    tone: "border-brand-blue bg-brand-blueBg text-brand-blue",
  },
  {
    key: "BusinessDeveloper",
    label: "Business Developer",
    email: "rohit@example.com",
    blurb: "Project pipeline · clients · intake",
    lands: "/projects",
    Icon: Briefcase,
    tone: "border-brand-yellow bg-brand-yellowBg text-brand-yellowText",
  },
  {
    key: "Developer",
    label: "Developer",
    email: "sanjana@example.com",
    blurb: "Today's tasks · status updates · remarks",
    lands: "/my-tasks",
    Icon: Code,
    tone: "border-brand-green bg-brand-greenBg text-brand-greenText",
  },
];

const DEFAULT_PASSWORD = "ChangeMe2026!";

export default function LoginPage() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email/password fallback for real users (collapsed by default)
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function pickRole(tile: RoleTile) {
    setError(null);
    setBusyKey(tile.key);

    // 1. Hard-clear any stale auth cookies first so we never end up with
    //    a JWT for a different role from a previous session.
    await fetch("/api/signout", {
      method: "GET",
      redirect: "manual",
    }).catch(() => {});

    // 2. Sign in with this tile's seeded credentials.
    const result = await signIn("credentials", {
      email: tile.email,
      password: DEFAULT_PASSWORD,
      redirect: false,
    });

    if (!result || result.error) {
      setError(
        `Couldn't sign in (${result?.error ?? "no response"}). Check that the database is reachable and seeded.`,
      );
      setBusyKey(null);
      return;
    }

    // 3. Hard nav so the new cookie is read on the next request.
    window.location.assign(tile.lands);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusyKey("__email");

    await fetch("/api/signout", {
      method: "GET",
      redirect: "manual",
    }).catch(() => {});

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("Invalid email or password.");
      setBusyKey(null);
      return;
    }

    window.location.assign("/");
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

        {error && (
          <div className="max-w-md mx-auto mb-6 px-4 py-3 rounded bg-brand-redBg text-brand-redText text-sm flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {TILES.map((tile) => {
            const Icon = tile.Icon;
            const busy = busyKey === tile.key;
            const disabled = busyKey !== null;
            return (
              <button
                key={tile.key}
                disabled={disabled}
                onClick={() => pickRole(tile)}
                className={`card p-5 text-left transition group ${
                  disabled
                    ? "opacity-60 cursor-wait"
                    : "hover:shadow-md hover:-translate-y-0.5"
                }`}
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
                    <div className="text-[11px] text-ink-400 font-mono truncate">
                      {tile.email}
                    </div>
                    <div className="text-[11px] text-ink-400">
                      Lands on <code>{tile.lands}</code>
                    </div>
                  </div>
                </div>
                {busy && (
                  <div className="mt-3 text-xs text-brand-blue">
                    Signing in…
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="max-w-md mx-auto">
          {!showEmail ? (
            <button
              onClick={() => setShowEmail(true)}
              className="w-full text-sm text-ink-500 hover:text-brand-blue py-2 border-t border-ink-200"
            >
              Or sign in with email and password →
            </button>
          ) : (
            <form
              onSubmit={submitEmail}
              className="card p-5 border-t-2 border-t-brand-blue"
            >
              <h3 className="font-heading text-sm font-semibold mb-4">
                Sign in with email
              </h3>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busyKey !== null}
                className="w-full px-3 py-2 mb-3 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:bg-ink-50"
                placeholder="you@company.com"
              />
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busyKey !== null}
                className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:bg-ink-50"
              />
              <button
                type="submit"
                disabled={busyKey !== null}
                className="btn-primary w-full disabled:opacity-60 disabled:cursor-wait"
              >
                {busyKey === "__email" ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => setShowEmail(false)}
                className="w-full text-xs text-ink-500 hover:text-ink-900 mt-3"
              >
                Hide form
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-ink-400 mt-8">
          Pre-launch seeded accounts · default password{" "}
          <code>{DEFAULT_PASSWORD}</code>
        </p>
      </div>
    </main>
  );
}
