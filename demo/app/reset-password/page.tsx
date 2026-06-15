"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Shell loading />}>
      <ResetForm />
    </Suspense>
  );
}

function Shell({
  loading,
  children,
}: {
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-ink-50 grid place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <Logo size="lg" />
        </div>
        <div className="card p-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-brand-blue mb-4"
          >
            <ArrowLeft size={12} /> Back to sign in
          </Link>
          <h1 className="font-heading text-xl font-semibold mb-1">
            Choose a new password
          </h1>
          {loading ? (
            <p className="text-sm text-ink-500 mt-2">Loading…</p>
          ) : (
            children
          )}
        </div>
      </div>
    </main>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(params.get("token") ?? "");
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't reset password.");
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/login"), 1500);
  }

  return (
    <Shell>
      {!token && (
        <p className="text-sm text-brand-redText mt-3">
          This link is missing its token. Open the link from your email
          again, or ask for a new one.
        </p>
      )}
      {token && !done && (
        <>
          <p className="text-sm text-ink-500 mb-5 mt-1">
            At least 10 characters with one letter and one digit/symbol.
          </p>
          <form onSubmit={submit}>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              New password
            </label>
            <div className="relative mb-4">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
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
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Confirm new password
            </label>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••"
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            {error && (
              <p className="text-xs text-brand-redText mb-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={!password || !confirm || submitting}
              className="btn-primary w-full"
            >
              <KeyRound size={16} className="mr-1.5" /> Reset password
            </button>
          </form>
        </>
      )}
      {done && (
        <div className="rounded card-soft bg-brand-greenBg p-4 text-sm text-brand-greenText mt-3">
          Password updated. Redirecting you to sign in…
        </div>
      )}
    </Shell>
  );
}
