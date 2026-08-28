"use client";

import { useId, type FormEvent } from "react";
import { ArrowRight, Lock, Mail, ShieldCheck, Sparkles, Zap } from "lucide-react";

/**
 * A self-contained sign-in card.
 *
 * No UI library, no context, no data fetching — plain inputs and a submit
 * handler, so it drops into any page and the page owns the credentials.
 *
 * Two deliberate departures from the brief:
 *
 *  - Tailwind here is 3.4, so the gradients use `bg-gradient-to-*`. The v4
 *    names (`bg-linear-to-*`) are not utilities in this version and would
 *    have rendered a flat background with no error to explain why.
 *  - Fonts come from the variables `app/layout.tsx` already publishes via
 *    next/font (`--font-heading` Space Grotesk, `--font-body` Poppins)
 *    rather than @fontsource, which would pull the same two families in a
 *    second time. Scoped to the wrapper exactly as asked, so nothing
 *    outside this card is affected.
 */

export type SignInCardProps = {
  /** Controlled email value. */
  email: string;
  onEmailChange: (value: string) => void;
  /** Controlled password value. */
  password: string;
  onPasswordChange: (value: string) => void;
  /** Called on submit. The card never touches credentials itself. */
  onSubmit: () => void;
  /** Swaps the button to "Signing in…" and blocks re-submission. */
  loading?: boolean;
  /** Shown above the button. Null or empty renders nothing. */
  error?: string | null;
  title?: string;
  eyebrow?: string;
  chips?: string[];
  footerHint?: string;
};

const CHIP_ICONS = [Zap, Sparkles] as const;

/** Scopes the two families to this card and nothing else. */
const FONT_SCOPE: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
};
const HEADING_FONT: React.CSSProperties = {
  fontFamily: "var(--font-heading), system-ui, sans-serif",
};

function CardHeader({
  title,
  eyebrow,
  chips,
}: {
  title: string;
  eyebrow: string;
  chips: string[];
}) {
  return (
    <div className="relative overflow-hidden rounded-t-[23px] bg-gradient-to-br from-indigo-700 via-indigo-600 to-sky-600 px-7 pt-6 pb-7 text-white">
      {/* Decorative only — never intercepts a click meant for the form. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl"
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <ShieldCheck size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              {eyebrow}
            </p>
            <h1 className="truncate text-2xl font-bold" style={HEADING_FONT}>
              {title}
            </h1>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[11px] ring-1 ring-white/25">
          Secure
        </span>
      </div>

      {chips.length > 0 && (
        <div className="relative mt-5 flex flex-wrap gap-2">
          {chips.map((chip, i) => {
            const Icon = CHIP_ICONS[i % CHIP_ICONS.length];
            return (
              <span
                key={chip}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1 text-xs ring-1 ring-white/15"
              >
                <Icon size={13} />
                {chip}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  Icon,
  disabled,
}: {
  id: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  Icon: typeof Mail;
  disabled: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-11 pr-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 disabled:opacity-60"
        />
      </div>
    </div>
  );
}

export function SignInCard({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  onSubmit,
  loading = false,
  error = null,
  title = "My App",
  eyebrow = "Company",
  chips = ["Feature A", "Feature B"],
  footerHint = "Trouble signing in? Contact your administrator.",
}: SignInCardProps) {
  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    onSubmit();
  }

  return (
    <div style={FONT_SCOPE} className="relative w-full max-w-sm">
      {/* 1px gradient border: a tinted layer behind a p-[1px] white sheet. */}
      <div className="relative rounded-3xl bg-white p-[1px] shadow-[0_20px_60px_-20px_rgba(49,46,129,0.35)]">
        <div
          aria-hidden
          className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-400/60 via-indigo-200/30 to-sky-400/60"
        />
        <div className="relative rounded-[23px] bg-white">
          <CardHeader title={title} eyebrow={eyebrow} chips={chips} />

          <form onSubmit={handleSubmit} className="space-y-4 px-7 pt-6 pb-7">
            <Field
              id={emailId}
              label="Email"
              type="email"
              value={email}
              onChange={onEmailChange}
              autoComplete="email"
              placeholder="you@company.com"
              Icon={Mail}
              disabled={loading}
            />
            <Field
              id={passwordId}
              label="Password"
              type="password"
              value={password}
              onChange={onPasswordChange}
              autoComplete="current-password"
              placeholder="••••••••"
              Icon={Lock}
              disabled={loading}
            />

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-700 hover:to-sky-700 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && (
                <ArrowRight
                  size={18}
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5"
                />
              )}
            </button>

            <p className="text-center text-xs text-slate-500">{footerHint}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
