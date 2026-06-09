"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAccounts } from "@/lib/account-store";
import { landingFor, ROLE_LABELS, type Role } from "@/lib/role";

const ROLES: Role[] = ["Admin", "Coordinator", "BusinessDeveloper", "Developer"];

export default function SignupPage() {
  const router = useRouter();
  const { register, current, hydrated } = useAccounts();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Developer");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && current) router.replace(landingFor(current.role));
  }, [hydrated, current, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    const result = await register({ name, email, role, password });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(landingFor(result.account.role));
  }

  return (
    <main className="min-h-screen bg-ink-50 grid place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <Logo size="lg" />
        </div>
        <div className="card p-6">
          <h1 className="font-heading text-xl font-semibold mb-1">
            Create your account
          </h1>
          <p className="text-sm text-ink-500 mb-5">
            Pick your name, role, and a password.
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
              placeholder="e.g. Neha Sharma"
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
              placeholder="name@example.com"
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
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
              <UserPlus size={16} className="mr-1.5" /> Create account & sign
              in
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
