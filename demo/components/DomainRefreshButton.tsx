"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { fmtTime } from "@/lib/domain-format";

/**
 * A Refresh button that shows it did something.
 *
 * The three of these across Forecast, KPIs and Resource engagement all
 * fired their request correctly and then gave no sign of it: no spinner,
 * no disabled state, and — because the data is usually unchanged — nothing
 * visibly different on screen. A button that works and looks broken is
 * worse than one that is obviously broken, because people keep clicking
 * it.
 *
 * So: the icon spins, the button locks while in flight, and the time of
 * the last successful refresh stays on screen. That last part is what
 * actually answers "did it do anything?" when the numbers are identical.
 */

/** Below this, a spin is over before the eye registers it and the button
 *  reads as dead again. Slower refreshes are unaffected. */
const MIN_SPIN_MS = 450;

export function DomainRefreshButton({
  onRefresh,
  label = "Refresh",
}: {
  /** Resolve when the data is in — return the load promise, not void. */
  onRefresh: () => Promise<unknown> | void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    const started = Date.now();
    try {
      await onRefresh();
      setLastAt(fmtTime());
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed < MIN_SPIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
      }
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {lastAt && (
        <span className="text-xs text-ink-400 tabular-nums">
          Updated {lastAt}
        </span>
      )}
      <button
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        className="btn-ghost inline-flex items-center gap-1.5 disabled:opacity-60"
      >
        <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        {busy ? "Refreshing…" : label}
      </button>
    </span>
  );
}
