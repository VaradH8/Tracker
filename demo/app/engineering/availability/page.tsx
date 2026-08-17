"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  DomainResourceTable,
  allFreeFrom,
  nextFreeFrom,
  type ResourceRow,
} from "@/components/DomainResourceTable";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { fmtDate } from "@/lib/domain-format";

/**
 * Resource availability — who is free, who is booked, until when, and how
 * fast they deliver.
 *
 * This page used to show an hours-based capacity read (weekly hours vs
 * estimated hours on open tasks), which measured something different from
 * the tag-driven forecast and left two contradictory answers to "is this
 * person busy?". It now shows the same tag-based picture the rest of the
 * Domain module uses, so there's one answer.
 *
 * Delivery projections live on the Forecast page; this page is only about
 * people.
 */
export default function AvailabilityPage() {
  const [resources, setResources] = useState<ResourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/domain/forecast", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) {
          throw new Error("Resource availability is for Leads and Admins.");
        }
        if (!r.ok) throw new Error("Couldn't load resource availability.");
        return r.json();
      })
      .then((b) => {
        setResources(b.resources ?? []);
        setError(null);
      })
      .catch((e: Error) => {
        setResources([]);
        setError(e.message);
      });
  }, []);

  useEffect(load, [load]);

  const free = (resources ?? []).filter((r) => r.status === "Free").length;
  const booked = (resources ?? []).length - free;
  // When the last commitment ends — the day the whole team is available.
  const everyoneFree = allFreeFrom(resources ?? []);
  const soonestFree = nextFreeFrom(resources ?? []);

  // The shared formatter, so this screen reads the same as every other.
  const fmtDay = (iso: string | null) => (iso ? fmtDate(iso) : null);
  const soonestPerson = (resources ?? []).find(
    (r) => r.availableFrom === soonestFree,
  );

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Resource availability"
        description="Who is free to take work and who is committed — with what they're on, how far it has got, and the day they come free. Filter by role to plan one group at a time."
        actions={
          <button
            onClick={load}
            className="btn-ghost inline-flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error && (
        <div className="card p-4 mb-6 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {resources !== null && resources.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
          <div className="card p-4">
            <div className="text-xs text-ink-500 font-medium">People</div>
            <div className="font-heading text-3xl font-semibold mt-1">
              {resources.length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-500 font-medium">Free now</div>
            <div className="font-heading text-3xl font-semibold mt-1 text-brand-greenText">
              {free}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-500 font-medium">Allocated</div>
            <div className="font-heading text-3xl font-semibold mt-1 text-brand-blue">
              {booked}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-500 font-medium">Next one free</div>
            <div className="font-heading text-xl font-semibold mt-1 text-ink-900">
              {soonestFree ? fmtDay(soonestFree) : "Now"}
            </div>
            {soonestPerson && (
              <div className="text-xs text-ink-500 mt-0.5">
                {soonestPerson.name}
              </div>
            )}
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-500 font-medium">
              Everyone free from
            </div>
            <div
              className={`font-heading text-xl font-semibold mt-1 ${everyoneFree ? "text-brand-yellowText" : "text-brand-greenText"}`}
            >
              {everyoneFree ? fmtDay(everyoneFree) : "Now"}
            </div>
            <div className="text-xs text-ink-500 mt-0.5">
              {everyoneFree
                ? "when the last booking ends"
                : "nobody is committed"}
            </div>
          </div>
        </div>
      )}

      {resources === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <DomainResourceTable resources={resources} />
      )}
    </DomainPage>
  );
}
