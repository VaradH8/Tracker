"use client";

import { useCallback, useRef } from "react";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainDeliveryByDate } from "@/components/DomainDeliveryByDate";
import { DomainRefreshButton } from "@/components/DomainRefreshButton";

/**
 * Delivery by date — its own section.
 *
 * This used to sit on the Forecast page. It answers a different question:
 * Forecast asks "will each project land on time", this asks "what did we
 * actually ship, day by day, across everything". Reading one while looking
 * for the other meant scrolling past a page of per-project detail, so it
 * gets its own destination.
 *
 * Access is unchanged — the API behind it (/api/domain/forecast/delivery)
 * still enforces the supervisor roles, so this page adds no new reach.
 */
export default function DeliveryPage() {
  /**
   * The card owns its own loader because its filters re-fetch. The page
   * borrows that function for its Refresh button rather than issuing a
   * second request. A ref, not state: re-registering must not re-render,
   * or the card would remount on every filter change.
   */
  const reload = useRef<(() => Promise<unknown>) | null>(null);
  const register = useCallback((fn: () => Promise<unknown>) => {
    reload.current = fn;
  }, []);
  const refresh = useCallback(
    () => reload.current?.() ?? Promise.resolve(),
    [],
  );

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Delivery by date"
        description="Tags submitted across every division, day by day, and how many a Lead has signed off. Filter by day or week, by division, or down to a single project."
        actions={<DomainRefreshButton onRefresh={refresh} />}
      />

      <DomainDeliveryByDate onReady={register} heading={false} />
    </DomainPage>
  );
}
