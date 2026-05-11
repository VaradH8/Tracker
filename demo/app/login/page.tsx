"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { landingFor, type Role } from "@/lib/role";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("Invalid email or password.");
      setBusy(false);
      return;
    }

    const session = await getSession();
    const role =
      ((session?.user as { role?: Role } | undefined)?.role) ?? "Coordinator";
    router.replace(landingFor(role));
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
        <div className="text-xs text-ink-400">v1.0</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <Link href="/" className="lg:hidden mb-8 inline-flex">
            <Logo size="lg" />
          </Link>
          <h1 className="font-heading text-2xl font-semibold mb-1">
            Welcome back
          </h1>
          <p className="text-ink-500 text-sm mb-8">
            Sign in to your Task Manager account.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-brand-redBg text-brand-redText text-sm flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue disabled:bg-ink-50"
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
            disabled={busy}
            className="w-full px-3 py-2 mb-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue disabled:bg-ink-50"
          />

          <div className="flex items-center justify-between text-xs mb-6">
            <label className="flex items-center gap-2 text-ink-500">
              <input type="checkbox" className="accent-brand-blue" /> Remember
              me
            </label>
            <a href="#" className="text-brand-blue hover:underline">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full disabled:opacity-60 disabled:cursor-wait"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-ink-400 mt-6 text-center">
            Need access? Ask your Admin to send an invite.
          </p>
        </form>
      </div>
    </main>
  );
}
