"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }, [error]);

  return (
    <main className="min-h-screen grid place-items-center px-6 bg-ink-50">
      <div className="card p-10 max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="w-12 h-12 mx-auto rounded-full bg-brand-redBg grid place-items-center mb-4">
          <AlertTriangle size={22} className="text-brand-redText" />
        </div>
        <h1 className="font-heading text-2xl font-semibold mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-ink-500 mb-6">
          We hit an unexpected error. You can try again, or head back home.
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-ink-400 mb-4">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link
            href="/"
            className="btn-ghost border border-ink-200 inline-flex items-center px-4 py-2 rounded text-sm"
          >
            Take me home
          </Link>
        </div>
      </div>
    </main>
  );
}
