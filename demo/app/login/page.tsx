"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAccounts, DEMO_DEFAULT_PASSWORD } from "@/lib/account-store";
import { landingFor } from "@/lib/role";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, current, hydrated } = useAccounts();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && current) {
      router.replace(landingFor(current.role));
    }
  }, [hydrated, current, router]);

  function fillDemo(email: string) {
    setUser(email);
    setPassword(DEMO_DEFAULT_PASSWORD);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = signIn(user, password);
    setSubmitting(false);
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
          <h1 className="font-heading text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-ink-500 mb-5">
            Use your email or first name to sign in.
          </p>
          <form onSubmit={submit}>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Email or username
            </label>
            <input
              autoFocus
              type="text"
              value={user}
              onChange={(e) => {
                setUser(e.target.value);
                setError(null);
              }}
              placeholder="e.g. manasi@example.com or manasi"
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Password
            </label>
            <div className="relative mb-4">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                className="w-full px-3 py-2 pr-10 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-400 hover:text-ink-700"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && (
              <p className="text-xs text-brand-redText mb-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={!user.trim() || !password || submitting}
              className="btn-primary w-full"
            >
              <LogIn size={16} className="mr-1.5" /> Sign in
            </button>
          </form>
          <p className="text-xs text-ink-500 text-center mt-4">
            New to the team?{" "}
            <Link href="/signup" className="text-brand-blue hover:underline">
              Create an account
            </Link>
          </p>
        </div>

        <div className="card p-4 mt-4 text-xs text-ink-500">
          <div className="font-medium text-ink-700 mb-2">
            Demo accounts · password{" "}
            <code className="text-ink-900 bg-ink-100 px-1 rounded">
              {DEMO_DEFAULT_PASSWORD}
            </code>
          </div>
          <ul className="space-y-1">
            {[
              { email: "varad@example.com", role: "Admin" },
              { email: "manasi@example.com", role: "Co-ordinator" },
              { email: "rohit@example.com", role: "Business Developer" },
              { email: "sanjana@example.com", role: "Developer" },
            ].map((d) => (
              <li key={d.email} className="flex items-center gap-2">
                <button
                  onClick={() => fillDemo(d.email)}
                  className="text-brand-blue hover:underline text-left"
                >
                  {d.email}
                </button>
                <span className="text-ink-400">— {d.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
