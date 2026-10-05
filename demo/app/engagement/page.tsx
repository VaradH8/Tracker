"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CurrentView } from "@/components/engagement/CurrentView";
import { ForecastView } from "@/components/engagement/ForecastView";
import { useEngagementData } from "@/components/engagement/shared";
import { canAccess } from "@/lib/access";
import { useRole } from "@/lib/role";

type Tab = "current" | "forecast";
const TABS: { id: Tab; label: string }[] = [
  { id: "current", label: "Current" },
  { id: "forecast", label: "Project forecast" },
];

/**
 * Resource Engagement & Project Forecast — Admin, Lead and Co-ordinator.
 *
 *   Current  — who is working on what (people × days grid) and who has
 *              no task right now.
 *   Forecast — pick an upcoming project and a track (Application /
 *              Plugin), tick people from that track, and see when they'd
 *              finish and how many to hire to meet the target.
 */
export default function EngagementPage() {
  // AppShell redirects anyone else; don't even ask the API for them.
  const [role, , hydrated] = useRole();
  const { data, error, reload } = useEngagementData(hydrated && canAccess(role, "/engagement"));
  const [tab, setTab] = useState<Tab>("current");
  const [help, setHelp] = useState(false);

  // Honour ?tab=forecast deep links.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "forecast") setTab("forecast");
  }, []);

  function switchTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "current") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold">Resource Engagement</h1>
          <div className="flex rounded border border-ink-200 bg-white p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={`rounded px-4 py-1.5 text-sm font-medium ${
                  tab === t.id ? "bg-brand-blue text-white" : "text-ink-700 hover:bg-ink-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setHelp((v) => !v)}
            aria-label="How to read this page"
            className="p-1 rounded-full text-ink-400 hover:text-brand-blue hover:bg-ink-100"
          >
            <Info size={18} />
          </button>
        </header>
        <p className="text-sm text-ink-500 -mt-2">
          Who is working on what, who is free — and who&apos;s available for upcoming projects.
        </p>

        {help && (
          <div className="card p-4 text-sm text-ink-700 space-y-1">
            <p className="font-semibold text-ink-900">Reading the grid</p>
            <p>
              Each row is a person. Weekly shows the 7 days of a week, monthly the days of a month, yearly the 52 weeks of a
              year — use ◀ ▶ to move, click the date label to jump to today. Blue = engaged on a project (darker = 2+
              projects), violet = forecast (what-if), amber = on leave, white = free, grey = non-working day. Hover a cell
              for what they&apos;re on; click a name for full details.
            </p>
            <p>
              Engagement comes from open tasks: a task keeps its assignees busy from its start date to its target date
              (overdue and undated tasks count through today). Projects On Hold or Delivered don&apos;t count.
            </p>
          </div>
        )}

        {error ? (
          <div className="card p-6 text-center text-sm text-brand-redText">{error}</div>
        ) : !data ? (
          <div className="card p-6 text-center text-sm text-ink-400">Loading…</div>
        ) : tab === "current" ? (
          <CurrentView data={data} />
        ) : (
          <ForecastView data={data} reload={reload} />
        )}
      </div>
    </AppShell>
  );
}
