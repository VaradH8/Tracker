/**
 * Placeholder shapes shown while data loads, in place of a bare
 * "Loading…" line: the page keeps its layout instead of jumping when the
 * data arrives. Screen readers hear one "Loading…" per placeholder region
 * (role="status"), not the decorative bars.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-ink-200/70 ${className}`}
    />
  );
}

/** A page body: heading, a row of stat tiles, a few list rows. */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="card p-4 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

/** One card's worth of placeholder rows. */
export function CardSkeleton({
  rows = 4,
  label = "Loading…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" className="card p-6 space-y-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}

/** Full-screen placeholder for the moment before the app shell knows who
 *  is signed in: a sidebar and a page body. */
export function ShellSkeleton() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen bg-ink-50 flex">
      <span className="sr-only">Loading…</span>
      <div className="hidden lg:block w-60 shrink-0 border-r border-ink-200 bg-white p-4 space-y-3">
        <Skeleton className="h-8 w-32 mb-6" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
      <div className="flex-1 p-6">
        <PageSkeleton />
      </div>
    </div>
  );
}

/** A few list rows, for a section inside an existing card. */
export function ListSkeleton({
  rows = 3,
  label = "Loading…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}
