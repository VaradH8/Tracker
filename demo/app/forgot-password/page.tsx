"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Something went wrong. Try again in a moment.");
      return;
    }
    setDone(true);
  }

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
            Forgot your password?
          </h1>
          <p className="text-sm text-ink-500 mb-5">
            Enter the email tied to your account. If it matches, we&apos;ll
            generate a one-time reset link your admin can share with you
            (no SMTP wired yet — the link lands in the admin email log).
          </p>
          {done ? (
            <div className="rounded card-soft bg-brand-greenBg p-4 text-sm text-brand-greenText">
              If that email matches an account, a reset link is on its way.
              Ask your admin to check the email log if you don&apos;t see it.
            </div>
          ) : (
            <form onSubmit={submit}>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Email
              </label>
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@inventivebizsol.co.in"
                className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              {error && (
                <p className="text-xs text-brand-redText mb-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={!email.trim() || submitting}
                className="btn-primary w-full"
              >
                <Mail size={16} className="mr-1.5" /> Send reset link
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
