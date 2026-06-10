"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAccounts } from "@/lib/account-store";
import { landingFor } from "@/lib/role";

export default function SignupPage() {
  const router = useRouter();
  const { register, current, hydrated } = useAccounts();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  // null = still checking, true = no users yet (bootstrap allowed),
  // false = users exist (signup locked, admin must add accounts).
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (hydrated && current) router.replace(landingFor(current.role));
  }, [hydrated, current, router]);

  useEffect(() => {
    fetch("/api/auth/signup", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setAllowed(Boolean(b.allowed)))
      .catch(() => setAllowed(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    // Role is forced to Admin server-side on first user.
    const result = await register({ name, email, role: "Admin", password });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(landingFor(result.account.role));
  }

  if (allowed === null) {
    return (
      <main className="min-h-screen bg-ink-50 grid place-items-center px-4">
        <p className="text-sm text-ink-500">Loading…</p>
      </main>
    );
  }

  if (allowed === false) {
    return (
      <main className="min-h-screen bg-ink-50 grid place-items-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center mb-8">
            <Logo size="lg" />
          </div>
          <div className="card p-6 text-center">
            <ShieldAlert
              size={28}
              className="mx-auto text-brand-yellowText mb-3"
            />
            <h1 className="font-heading text-xl font-semibold mb-2">
              Sign-up is closed
            </h1>
            <p className="text-sm text-ink-700 mb-5">
              The bootstrap admin account already exists on this instance.
              Ask your administrator to add you in <strong>Users</strong> →{" "}
              <strong>Add user</strong>. They&apos;ll share the initial
              password with you; change it from{" "}
              <strong>Profile</strong> after you sign in.
            </p>
            <Link href="/login" className="btn-primary inline-flex">
              Go to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink-50 grid place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <Logo size="lg" />
        </div>
        <div className="card p-6">
          <h1 className="font-heading text-xl font-semibold mb-1">
            Bootstrap your team
          </h1>
          <p className="text-sm text-ink-500 mb-5">
            This is the first account on this instance. It becomes the{" "}
            <strong>Admin</strong>. After this, sign-up is closed and you
            add the rest of the team via Admin → Users.
          </p>
          <form onSubmit={submit}>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Full name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Varad Hadawale"
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="you@company.com"
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="at least 6 characters"
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            {error && (
              <p className="text-xs text-brand-redText mb-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={
                !name.trim() || !email.trim() || !password || !confirm
              }
              className="btn-primary w-full"
            >
              <UserPlus size={16} className="mr-1.5" /> Create admin account
              & sign in
            </button>
          </form>
          <p className="text-xs text-ink-500 text-center mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-blue hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
