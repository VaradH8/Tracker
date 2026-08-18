"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAccounts } from "@/lib/account-store";
import { landingFor } from "@/lib/role";
import { BRAND_NAVY, InventiveLogo } from "@/components/InventiveBrand";

type Tab = "tracker" | "domain";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, current, hydrated } = useAccounts();
  const [tab, setTab] = useState<Tab>("tracker");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Preselect the Engineering tab when arriving via that area's redirect.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("engineering") === "1") setTab("domain");
    }
  }, []);

  useEffect(() => {
    if (tab === "tracker" && hydrated && current) {
      router.replace(landingFor(current.role));
    }
  }, [tab, hydrated, current, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await signIn(user, password);
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
          <div className="flex gap-1 mb-5 border-b border-ink-200">
            {(["tracker", "domain"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={
                  tab === t
                    ? "px-4 py-2 text-sm font-medium border-b-2 border-brand-blue text-brand-blue capitalize"
                    : "px-4 py-2 text-sm font-medium text-ink-500 hover:text-ink-900 capitalize"
                }
              >
                {t === "tracker" ? "Tracker" : "Engineering"}
              </button>
            ))}
          </div>

          {tab === "tracker" ? (
            <>
              <ModuleBrandBand label="Tracker" />
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
                <Link
                  href="/forgot-password"
                  className="text-brand-blue hover:underline"
                >
                  Forgot your password?
                </Link>
              </p>
              <p className="text-xs text-ink-500 text-center mt-2">
                Need access?{" "}
                <Link href="/signup" className="text-brand-blue hover:underline">
                  Bootstrap this instance
                </Link>{" "}
                (first user only) or ask your admin to add you.
              </p>
            </>
          ) : (
            <DomainLogin />
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * The brand band at the top of a sign-in panel.
 *
 * Full-bleed to the card edges so it reads as that panel's header rather
 * than an image sitting inside the form, and dark because the supplied
 * wordmark is white — the same treatment it gets on the company site.
 *
 * One component for both tabs: Tracker and Engineering are the same
 * product, and a band that differed between them by a few pixels would be
 * the first thing to rot.
 */
function ModuleBrandBand({ label }: { label: string }) {
  return (
    <div
      className="-mx-6 -mt-5 mb-6 px-6 py-6 flex flex-col items-center gap-2"
      style={{ background: BRAND_NAVY }}
    >
      <InventiveLogo height={46} />
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
        {label}
      </span>
    </div>
  );
}

function DomainLogin() {
  const router = useRouter();
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/domain/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null, needsBootstrap: false }))
      .then((b) => {
        if (b.user) {
          router.replace("/engineering");
          return;
        }
        setNeedsBootstrap(!!b.needsBootstrap);
      })
      .catch(() => setNeedsBootstrap(false));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const url = needsBootstrap
      ? "/api/domain/auth/bootstrap"
      : "/api/domain/auth/signin";
    const payload = needsBootstrap
      ? { name, email, password }
      : { email, password };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Sign-in failed.");
      return;
    }
    router.replace("/engineering");
  }

  if (needsBootstrap === null) {
    return <p className="text-sm text-ink-500 py-6 text-center">Loading…</p>;
  }

  return (
    <>
      <ModuleBrandBand label="Engineering" />

      <h1 className="font-heading text-xl font-semibold mb-1">
        {needsBootstrap ? "Set up the Engineering admin" : "Engineering sign in"}
      </h1>
      <p className="text-sm text-ink-500 mb-5">
        {needsBootstrap
          ? "No Engineering accounts yet — create the first admin to get started."
          : "Sign in to the Engineering module."}
      </p>
      <form onSubmit={submit}>
        {needsBootstrap && (
          <>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Your name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </>
        )}
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
          placeholder="you@example.com"
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
            placeholder={needsBootstrap ? "10+ chars, letter + digit" : "••••••••"}
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
        {error && <p className="text-xs text-brand-redText mb-3">{error}</p>}
        <button
          type="submit"
          disabled={
            !email.trim() ||
            !password ||
            (needsBootstrap && !name.trim()) ||
            submitting
          }
          className="btn-primary w-full"
        >
          <LogIn size={16} className="mr-1.5" />
          {needsBootstrap ? "Create admin & enter" : "Sign in"}
        </button>
      </form>
    </>
  );
}