import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-6 bg-ink-50">
      <div className="card p-10 max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <p className="font-mono text-xs text-ink-500 mb-2">404</p>
        <h1 className="font-heading text-2xl font-semibold mb-2">
          Page not found
        </h1>
        <p className="text-sm text-ink-500 mb-6">
          The link you followed might be broken, or the page may have been
          moved.
        </p>
        <Link href="/" className="btn-primary">
          Take me home
        </Link>
      </div>
    </main>
  );
}
